/** 現在の通知と照合してWebviewの描画完了を送る。 */
import type { PreviewUpdate, WebviewMessage } from "../../preview-protocol";

/** 現在の文書と通知順に一致する描画完了だけを送る。
 * @param rendered 図の準備まで完了した通知。
 * @param current 現在受け付けている最新の通知。未受信ならundefined。
 * @param send 検証済みの完了通知をExtensionへ送る操作。
 */
export function completePreviewRender(
  rendered: PreviewUpdate,
  current: PreviewUpdate | undefined,
  send: (message: WebviewMessage) => void,
): void {
  if (rendered.uri !== current?.uri || rendered.sequence !== current.sequence)
    return;
  send({
    type: "glitchstate.rendered",
    uri: rendered.uri,
    version: rendered.version,
    sequence: rendered.sequence,
  });
}
