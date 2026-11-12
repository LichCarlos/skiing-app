import { ApiError } from "../../platform/api/api-error";
import type { ProfileContext, ProfilePatch, UserProfile } from "./profile-api";
import {
  isAssetId,
  normalizedNickname,
  ProfileUnconfirmedError,
  saveProfile,
} from "./profile-submission";

export type AvatarChoice<T> =
  | { kind: "keep" }
  | { kind: "clear" }
  | { kind: "new"; image: T; assetId?: string };
export interface ProfileEditorState<T> {
  busy: boolean;
  loaded: boolean;
  profile: ProfileContext | null;
  nickname: string;
  avatar: AvatarChoice<T>;
  needsReview: boolean;
  reviewed: boolean;
  notice: string | null;
}
interface Ports<T> {
  read(signal: AbortSignal): Promise<ProfileContext>;
  pick(signal: AbortSignal): Promise<T | null>;
  upload(
    image: T,
    signal: AbortSignal,
  ): Promise<{ assetId: string; status: string }>;
  patch(body: ProfilePatch, signal: AbortSignal): Promise<UserProfile>;
  saved(profile: UserProfile, signal: AbortSignal): Promise<void>;
  changed(state: ProfileEditorState<T>): void;
}
export class ProfileRun<T> {
  private lifetime: AbortController | null = null;
  private operation: {
    signal: AbortController;
    attempted: "upload" | "patch" | null;
    confirmed: boolean;
  } | null = null;
  private state: ProfileEditorState<T> = {
    busy: false,
    loaded: false,
    profile: null,
    nickname: "",
    avatar: { kind: "keep" },
    needsReview: false,
    reviewed: false,
    notice: null,
  };
  constructor(
    private readonly expected: { userId: number; account: string },
    private readonly ports: Ports<T>,
  ) {}
  snapshot() {
    return this.state;
  }
  activate() {
    if (!this.lifetime) {
      this.lifetime = new AbortController();
      this.update({ busy: false });
    }
  }
  dispose() {
    this.lifetime?.abort();
    this.lifetime = null;
    if (this.operation?.attempted && !this.operation.confirmed)
      this.update({
        needsReview: true,
        notice: "资料操作结果尚未确认，请刷新并人工核对后再编辑。",
      });
    this.operation?.signal.abort();
    this.operation = null;
    this.update({
      busy: false,
      loaded: false,
      profile: null,
      nickname: "",
      avatar: { kind: "keep" },
      reviewed: false,
    });
  }
  private update(patch: Partial<ProfileEditorState<T>>) {
    this.state = { ...this.state, ...patch };
    if (this.lifetime) this.ports.changed(this.state);
  }
  private editable() {
    return (
      !!this.lifetime &&
      !this.operation &&
      this.state.loaded &&
      !!this.state.profile?.canEdit &&
      !this.state.needsReview
    );
  }
  setNickname(nickname: string) {
    if (this.editable()) this.update({ nickname });
  }
  setAvatar(kind: "keep" | "clear") {
    if (this.editable()) this.update({ avatar: { kind } });
  }
  acknowledge() {
    if (
      this.lifetime &&
      !this.operation &&
      this.state.loaded &&
      this.state.reviewed
    )
      this.update({
        needsReview: false,
        reviewed: false,
        notice: "已人工核对最新资料，可以重新编辑；上次写入结果不据此判定。",
      });
  }
  private validate(value: ProfileContext, editing = false, upload = false) {
    if (
      value.userId !== this.expected.userId ||
      value.account !== this.expected.account ||
      (editing && !value.canEdit) ||
      (upload && !value.canUpload)
    )
      throw new ApiError("账号或资料权限已变化，请刷新后重试。", {
        status: 403,
        code: null,
        traceId: null,
      });
    return value;
  }
  private async execute(
    work: (
      signal: AbortSignal,
      current: () => boolean,
      op: NonNullable<ProfileRun<T>["operation"]>,
    ) => Promise<void>,
  ) {
    const lifetime = this.lifetime;
    if (!lifetime || this.operation) return false;
    const op = {
      signal: new AbortController(),
      attempted: null as "upload" | "patch" | null,
      confirmed: false,
    };
    this.operation = op;
    this.update({ busy: true, notice: null });
    const current = () =>
      this.lifetime === lifetime &&
      this.operation === op &&
      !op.signal.signal.aborted;
    try {
      await work(op.signal.signal, current, op);
      return op.confirmed || current();
    } catch (cause) {
      if (op.confirmed) {
        if (current())
          this.update({
            notice: "资料已保存，页面刷新未完成，请返回后重新读取。",
          });
        return true;
      }
      if (!current()) return false;
      // A preflight read can fail inside saveProfile's patch port before PATCH.
      const error =
        !op.attempted && cause instanceof ProfileUnconfirmedError
          ? cause.cause
          : cause;
      const definitive =
        error instanceof ApiError &&
        error.status >= 400 &&
        error.status < 500 &&
        error.status !== 408;
      const review =
        (op.attempted !== null && !definitive) ||
        (error instanceof ApiError && error.status === 409);
      this.update({
        needsReview: this.state.needsReview || review,
        reviewed: false,
        notice: review
          ? op.attempted === "upload"
            ? "头像上传结果尚未确认，资料尚未提交；请刷新并人工核对，不会自动重传或删除文件。"
            : "资料保存结果尚未确认，请刷新并人工核对；不会自动重复保存。"
          : error instanceof ApiError && error.status === 403
            ? "账号或资料权限已变化，请刷新后重试。"
            : error instanceof ApiError && error.status === 401
              ? "登录已失效，请重新登录。"
              : error instanceof Error
                ? error.message
                : "资料操作失败，请重试。",
        ...(error instanceof ApiError && [401, 403].includes(error.status)
          ? { loaded: false, profile: null }
          : {}),
      });
      return false;
    } finally {
      if (current()) {
        this.operation = null;
        this.update({ busy: false });
      }
    }
  }
  reload() {
    return this.execute(async (signal, current) => {
      this.update({
        loaded: false,
        profile: null,
        avatar: { kind: "keep" },
        nickname: "",
        reviewed: false,
      });
      const profile = this.validate(await this.ports.read(signal));
      if (!current()) return;
      this.update({
        loaded: true,
        profile,
        nickname: profile.nickname,
        reviewed: this.state.needsReview,
        notice: this.state.needsReview
          ? "已读取最新昵称和头像。请人工核对后确认再编辑；读取结果不能证明上次头像写入成功。"
          : null,
      });
    });
  }
  pick() {
    if (!this.editable() || !this.state.profile?.canUpload)
      return Promise.resolve(false);
    return this.execute(async (signal, current) => {
      this.validate(await this.ports.read(signal), true, true);
      if (!current()) return;
      const image = await this.ports.pick(signal);
      if (!current() || image === null) return;
      this.update({ avatar: { kind: "new", image } });
    });
  }
  save() {
    if (!this.editable()) return Promise.resolve(false);
    const nickname = this.state.nickname,
      avatar = this.state.avatar;
    return this.execute(async (signal, current, op) => {
      normalizedNickname(nickname);
      this.validate(await this.ports.read(signal), true, avatar.kind === "new");
      if (!current()) return;
      const profile = await saveProfile(
        { nickname, avatar },
        {
          isActive: current,
          upload: async (image) => {
            if (avatar.kind === "new" && avatar.assetId)
              return { assetId: avatar.assetId, status: "ready" };
            op.attempted = "upload";
            const result = await this.ports.upload(image, signal);
            if (!current())
              throw new DOMException("Screen closed", "AbortError");
            if (!isAssetId(result.assetId))
              throw new Error("头像资产编号无效，请核对上传结果");
            op.attempted = null;
            if (result.status === "ready")
              this.update({
                avatar: { kind: "new", image, assetId: result.assetId },
              });
            return result;
          },
          patch: async (body) => {
            this.validate(
              await this.ports.read(signal),
              true,
              avatar.kind === "new",
            );
            if (!current())
              throw new DOMException("Screen closed", "AbortError");
            op.attempted = "patch";
            const value = await this.ports.patch(body, signal);
            if (
              value.userId !== this.expected.userId ||
              value.account !== this.expected.account
            )
              throw new Error("保存响应账号不符");
            return value;
          },
        },
      );
      if (!current()) return;
      op.confirmed = true;
      this.update({
        nickname: profile.nickname,
        avatar: { kind: "keep" },
        profile: {
          ...this.state.profile!,
          nickname: profile.nickname,
          avatarUrl: profile.avatarUrl,
        },
        notice: "资料已保存。",
      });
      await this.ports.saved(profile, signal);
    });
  }
}
