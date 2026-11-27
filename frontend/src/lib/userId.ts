// 端末ID：ログインなしで「自分の履歴」を見分けるためのランダムなID。
// ブラウザに保存するので、別の端末やブラウザのデータ削除後は別人として扱われる。
const KEY = "itoguchi_user_id";
let memoryId: string | null = null;

function randomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  // http（非セキュア環境）では randomUUID が使えないため
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
}

export function getUserId(): string {
  try {
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = randomId();
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    // プライベートモードなどで保存できない場合は、このタブの間だけ使う
    memoryId ??= randomId();
    return memoryId;
  }
}
