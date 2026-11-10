/** 現在の図の画像生成と保存先への書き込みを調整する。 */
import {
  type ExportFormat,
  type ExportMessage,
  type ExportRequest,
  type ExportResult,
  type ExportStart,
  readExportMessage,
} from "../preview-protocol";
import { MAX_EXPORT_BYTES } from "../preview-protocol/export-config";

export const EXPORT_TIMEOUT_MS = 60_000;
type Identity = Pick<ExportStart, "uri" | "version" | "sequence">;
type SaveOptions = {
  defaultUri: string;
  filters: Record<string, string[]>;
  saveLabel: string;
};
export interface DiagramExportPort {
  current(): Identity | undefined;
  pickFormat(
    options: { label: string; description: string; format: ExportFormat }[],
  ): Promise<ExportFormat | undefined>;
  pickDestination(options: SaveOptions): Promise<string | undefined>;
  send(message: ExportMessage): Promise<boolean>;
  write(uri: string, bytes: Uint8Array): Promise<void>;
  notify(message: string): void;
}
const same = (a: Identity, b?: Identity) =>
  !!b &&
  a.uri === b.uri &&
  a.version === b.version &&
  a.sequence === b.sequence;
const changed = () =>
  new Error("図が更新されたため、もう一度エクスポートを実行してください");

/** 1件ずつ画像を要求し、現在の対象に一致する画像だけを保存する。
 * @param port 現在の表示の取得とダイアログ、通信、書き込み、失敗通知の境界。
 * @returns 保存の開始、生成応答の受理、処理の取り消し。
 */
export function createDiagramExport(port: DiagramExportPort) {
  let active:
    | { start: ExportStart; abort: (reason: Error) => void }
    | undefined;
  let waiting:
    | {
        request: ExportRequest;
        resolve: (message: ExportResult) => void;
        reject: (error: Error) => void;
      }
    | undefined;
  return {
    async start(start: ExportStart) {
      if (active) return;
      let abort!: (reason: Error) => void;
      const aborted = new Promise<never>((_, reject) => {
        abort = reject;
      });
      const operation = { start, abort };
      active = operation;
      const check = () => {
        if (active !== operation || !same(start, port.current()))
          throw changed();
      };
      try {
        check();
        const format = await Promise.race([
          port.pickFormat([
            { label: "PNG", description: "高解像度の画像", format: "png" },
            {
              label: "SVG",
              description: "拡大可能なベクター画像",
              format: "svg",
            },
          ]),
          aborted,
        ]);
        if (!format) return;
        check();
        const source = new URL(start.uri);
        source.pathname = source.pathname.replace(/\.gls$/i, `.${format}`);
        const destination = await Promise.race([
          port.pickDestination({
            defaultUri: source.toString(),
            filters: { [format.toUpperCase()]: [format] },
            saveLabel: "図を保存",
          }),
          aborted,
        ]);
        if (!destination) return;
        check();
        if (!new URL(destination).pathname.toLowerCase().endsWith(`.${format}`))
          throw new Error(`保存先には.${format}の拡張子を指定してください`);
        const request: ExportRequest = {
          ...start,
          type: "glitchstate.export",
          format,
        };
        let timer: ReturnType<typeof setTimeout> | undefined;
        let result: ExportResult;
        try {
          const response = new Promise<ExportResult>((resolve, reject) => {
            waiting = { request, resolve, reject };
            timer = setTimeout(
              () => reject(new Error("画像の生成がタイムアウトした")),
              EXPORT_TIMEOUT_MS,
            );
          });
          const sent = await Promise.race([port.send(request), aborted]);
          if (!sent) throw new Error("画像の生成要求を送信できない");
          result = await Promise.race([response, aborted]);
        } finally {
          clearTimeout(timer);
          waiting = undefined;
        }
        check();
        if (!result.success) throw new Error(result.error);
        const bytes = Buffer.from(
          result.data,
          format === "png" ? "base64" : "utf8",
        );
        if (bytes.length > MAX_EXPORT_BYTES)
          throw new Error("画像が大きすぎる");
        check();
        await port.write(destination, bytes);
      } catch (error) {
        if (port.current())
          port.notify(
            `図を保存できません: ${error instanceof Error ? error.message : String(error)}`,
          );
      } finally {
        if (active === operation) active = undefined;
        await port
          .send({ ...start, type: "glitchstate.export-finished" })
          .catch(() => false);
      }
    },
    receive(value: unknown) {
      if (!waiting || typeof value !== "object" || value === null) return;
      const raw = value as Partial<ExportResult>;
      if (
        raw.type !== "glitchstate.export-result" ||
        raw.requestId !== waiting.request.requestId ||
        !same(waiting.request, raw as Identity)
      )
        return;
      const result = readExportMessage(value);
      if (
        result?.type !== "glitchstate.export-result" ||
        result.format !== waiting.request.format
      )
        waiting.reject(new Error("画像の応答が不正です"));
      else waiting.resolve(result);
    },
    cancel() {
      active?.abort(changed());
    },
  };
}
