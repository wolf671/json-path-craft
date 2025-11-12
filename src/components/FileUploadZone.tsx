import { useCallback } from "react";
import { Upload, CheckCircle2, LucideIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface FileUploadZoneProps {
  title: string;
  description: string;
  icon: LucideIcon;
  file: File | null;
  onFileUpload: (file: File) => void;
  acceptedFileTypes: string;
}

export const FileUploadZone = ({
  title,
  description,
  icon: Icon,
  file,
  onFileUpload,
  acceptedFileTypes,
}: FileUploadZoneProps) => {
  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile) {
        onFileUpload(droppedFile);
      }
    },
    [onFileUpload]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFile = e.target.files?.[0];
      if (selectedFile) {
        onFileUpload(selectedFile);
      }
    },
    [onFileUpload]
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon className="h-5 w-5 text-primary" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          className={cn(
            "border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer hover:border-primary hover:bg-accent/50",
            file ? "border-success bg-success/5" : "border-border"
          )}
          onClick={() => document.getElementById(`file-input-${title}`)?.click()}
        >
          <input
            id={`file-input-${title}`}
            type="file"
            className="hidden"
            accept={acceptedFileTypes}
            onChange={handleFileInput}
          />

          {file ? (
            <div className="space-y-2">
              <CheckCircle2 className="h-12 w-12 text-success mx-auto" />
              <p className="text-sm font-medium text-foreground">{file.name}</p>
              <p className="text-xs text-muted-foreground">
                {(file.size / 1024).toFixed(2)} KB
              </p>
              <p className="text-xs text-success">File uploaded successfully</p>
            </div>
          ) : (
            <div className="space-y-2">
              <Upload className="h-12 w-12 text-muted-foreground mx-auto" />
              <p className="text-sm text-muted-foreground">
                Drop file here or click to browse
              </p>
              <p className="text-xs text-muted-foreground">
                Accepted formats: JSON, TXT
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
