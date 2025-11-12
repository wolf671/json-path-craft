import { useState } from "react";
import { Upload, Download, FileJson, FileText, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { FileUploadZone } from "@/components/FileUploadZone";
import { ResultDisplay } from "@/components/ResultDisplay";

interface ApiMonitorEntry {
  api: string;
  context_path: string;
  method: string;
  [key: string]: any;
}

interface PolicyEntry {
  info?: {
    screenName?: string;
    groupName?: string;
  };
  "Grid Access"?: {
    [key: string]: string;
  };
  [key: string]: any;
}

interface GeneratedItem {
  path: string;
  rolePath: string[];
}

const Index = () => {
  const [apiFile, setApiFile] = useState<File | null>(null);
  const [policyFile, setPolicyFile] = useState<File | null>(null);
  const [generatedJson, setGeneratedJson] = useState<GeneratedItem[] | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const { toast } = useToast();

  const handleApiFileUpload = (file: File) => {
    setApiFile(file);
    setGeneratedJson(null);
    toast({
      title: "API Monitor File Uploaded",
      description: `${file.name} loaded successfully`,
    });
  };

  const handlePolicyFileUpload = (file: File) => {
    setPolicyFile(file);
    setGeneratedJson(null);
    toast({
      title: "Policy File Uploaded",
      description: `${file.name} loaded successfully`,
    });
  };

  const processFiles = async () => {
    if (!apiFile || !policyFile) {
      toast({
        title: "Missing Files",
        description: "Please upload both files before processing",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);

    try {
      // Read and parse API monitor file
      const apiText = await apiFile.text();
      const apiData = JSON.parse(apiText);
      const apiMonitor: ApiMonitorEntry[] = apiData.xceler_api_monitor || [];

      // Read and parse policy file
      const policyText = await policyFile.text();
      const policyData: Record<string, PolicyEntry> = JSON.parse(policyText);

      // Generate combined JSON
      const results: GeneratedItem[] = [];

      for (const apiEntry of apiMonitor) {
        const fullPath = `${apiEntry.context_path}${apiEntry.api}`;
        
        // Find matching policy entries
        for (const [policyPath, policyEntry] of Object.entries(policyData)) {
          if (policyEntry["Grid Access"]) {
            const gridAccess = policyEntry["Grid Access"];
            
            for (const [accessType, _] of Object.entries(gridAccess)) {
              const rolePath = `${policyPath}.Grid Access.${accessType}`;
              
              results.push({
                path: fullPath,
                rolePath: [rolePath],
              });
            }
          }
        }
      }

      setGeneratedJson(results);
      toast({
        title: "Processing Complete",
        description: `Generated ${results.length} combined entries`,
      });
    } catch (error) {
      console.error("Processing error:", error);
      toast({
        title: "Processing Failed",
        description: error instanceof Error ? error.message : "Failed to process files",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadJson = () => {
    if (!generatedJson) return;

    const output = {
      generatedJson,
    };

    const blob = new Blob([JSON.stringify(output, null, 2)], {
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

  const clearAll = () => {
    setApiFile(null);
    setPolicyFile(null);
    setGeneratedJson(null);
    toast({
      title: "Cleared",
      description: "All data has been reset",
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <header className="mb-8 text-center">
          <h1 className="text-4xl font-bold text-foreground mb-2">
            API Policy Combiner
          </h1>
          <p className="text-muted-foreground text-lg">
            Upload your API monitor and policy files to generate combined role mappings
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <FileUploadZone
            title="API Monitor File"
            description="Upload xceler_api_monitor JSON file"
            icon={FileJson}
            file={apiFile}
            onFileUpload={handleApiFileUpload}
            acceptedFileTypes=".json,application/json"
          />

          <FileUploadZone
            title="Policy File"
            description="Upload policy JSON/TXT file"
            icon={FileText}
            file={policyFile}
            onFileUpload={handlePolicyFileUpload}
            acceptedFileTypes=".json,.txt,application/json,text/plain"
          />
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {generatedJson ? (
                <CheckCircle2 className="h-5 w-5 text-success" />
              ) : (
                <AlertCircle className="h-5 w-5 text-muted-foreground" />
              )}
              Processing Controls
            </CardTitle>
            <CardDescription>
              {apiFile && policyFile
                ? "Both files uploaded. Ready to process."
                : "Upload both files to enable processing."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3 flex-wrap">
              <Button
                onClick={processFiles}
                disabled={!apiFile || !policyFile || isProcessing}
                size="lg"
                className="flex-1 min-w-[200px]"
              >
                <Upload className="mr-2 h-4 w-4" />
                {isProcessing ? "Processing..." : "Generate Combined JSON"}
              </Button>

              {generatedJson && (
                <Button
                  onClick={downloadJson}
                  variant="secondary"
                  size="lg"
                  className="flex-1 min-w-[200px]"
                >
                  <Download className="mr-2 h-4 w-4" />
                  Download Result
                </Button>
              )}

              <Button
                onClick={clearAll}
                variant="outline"
                size="lg"
                disabled={!apiFile && !policyFile && !generatedJson}
              >
                Clear All
              </Button>
            </div>
          </CardContent>
        </Card>

        {generatedJson && <ResultDisplay data={generatedJson} />}
      </div>
    </div>
  );
};

export default Index;
