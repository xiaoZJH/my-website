// pointStore.ts — ② 点位管理（增加 / 删除 / 清空 / 撤销）
import type { PromptPoint } from './types';

export class PointStore {
  private points: PromptPoint[] = [];
  private listeners: Array<(pts: PromptPoint[]) => void> = [];

  /** 新增一个提示点（自动触发 onChange） */
  add(p: PromptPoint) {
    this.points.push(p);
    this.emit();
  }

  /** 撤销最后一个点 */
  undo() {
    if (this.points.length === 0) return;
    this.points.pop();
    this.emit();
  }

  /** 清空所有点 */
  clear() {
    if (this.points.length === 0) return;
    this.points = [];
    this.emit();
  }

  /** 当前所有点（副本，防止外部篡改） */
  get(): PromptPoint[] {
    return [...this.points];
  }

  get length(): number {
    return this.points.length;
  }

  /** 订阅点集合变化（用于刷新按钮状态、重新请求 SAM） */
  onChange(cb: (pts: PromptPoint[]) => void) {
    this.listeners.push(cb);
  }

  private emit() {
    const snap = this.get();
    this.listeners.forEach((l) => l(snap));
  }
}
