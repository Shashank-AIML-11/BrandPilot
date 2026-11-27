import { useState } from "react";
import { Download, ExternalLink, FileText } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export interface PreviewFile {
  name: string;
  url: string | null | undefined;
  mime?: string | undefined;
}

function kindOf(file: PreviewFile): "image" | "pdf" | "text" | "other" {
  const name = file.name.toLowerCase();
  const mime = (file.mime ?? "").toLowerCase();
  if (mime.startsWith("image/") || /\.(png|jpe?g|webp|gif|svg)$/.test(name)) return "image";
  if (mime === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (mime.startsWith("text/") || /\.(txt|md|markdown)$/.test(name)) return "text";
  return "other";
}

/** Holds which file is open. Use `open(file)` from a click handler and render `<FilePreview {...preview} />` once. */
export function usePreview() {
  const [file, setFile] = useState<PreviewFile | null>(null);
  return { file, open: setFile, close: () => setFile(null) };
}

/** Opens a logo, photo, asset or document in a large window, right on the page. */
export function FilePreview({ file, close }: { file: PreviewFile | null; close: () => void }) {
  const kind = file ? kindOf(file) : "other";
  return (
    <Dialog open={!!file} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="truncate pr-6 text-base">{file?.name}</DialogTitle>
          <DialogDescription className="sr-only">Preview of {file?.name}</DialogDescription>
        </DialogHeader>
        {file?.url ? (
          <>
            <div className="flex max-h-[70vh] min-h-[200px] items-center justify-center overflow-auto rounded-md border border-border bg-muted/30">
              {kind === "image" && <img src={file.url} alt={file.name} className="max-h-[70vh] max-w-full object-contain" />}
              {(kind === "pdf" || kind === "text") && (
                <iframe src={file.url} title={file.name} className="h-[70vh] w-full bg-white" />
              )}
              {kind === "other" && (
                <div className="flex flex-col items-center gap-2 p-10 text-center text-sm text-muted-foreground">
                  <FileText className="h-10 w-10" />
                  Your browser cannot show this file type here. Download it to read it.
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <Button asChild size="sm" variant="secondary">
                <a href={file.url} target="_blank" rel="noreferrer">
                  <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Open in new tab
                </a>
              </Button>
              <Button asChild size="sm" variant="secondary">
                <a href={file.url} download={file.name}>
                  <Download className="mr-1.5 h-3.5 w-3.5" /> Download
                </a>
              </Button>
            </div>
          </>
        ) : (
          <p className="p-6 text-sm text-muted-foreground">This file has no preview yet. Try again in a moment.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
