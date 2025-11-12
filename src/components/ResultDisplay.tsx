import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Copy, CheckCircle2, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";

interface GeneratedItem {
  path: string;
  rolePath: string[];
}

interface ResultDisplayProps {
  data: GeneratedItem[];
}

export const ResultDisplay = ({ data }: ResultDisplayProps) => {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const jsonOutput = JSON.stringify({ generatedJson: data }, null, 2);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(jsonOutput);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({
      title: "Copied to Clipboard",
      description: "The JSON output has been copied",
    });
  };

  const downloadJson = () => {
    const blob = new Blob([jsonOutput], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "combined-output.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast({
      title: "Download Started",
      description: "Your combined JSON file is being downloaded",
    });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-success" />
              Generated Output
            </CardTitle>
            <CardDescription>
              {data.length} entries generated from combined files
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={downloadJson}
              variant="default"
              size="sm"
              className="gap-2"
            >
              <Download className="h-4 w-4" />
              Download JSON
            </Button>
            <Button
              onClick={copyToClipboard}
              variant="outline"
              size="sm"
              className="gap-2"
            >
              {copied ? (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" />
                  Copy JSON
                </>
              )}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[500px] w-full rounded-md border bg-muted/30 p-4">
          <pre className="text-xs font-mono text-foreground">
            {jsonOutput}
          </pre>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};
