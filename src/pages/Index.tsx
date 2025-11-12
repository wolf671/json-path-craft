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

      // Helper function to determine access type based on java_method_name and method
      const determineAccessType = (javaMethodName: string, httpMethod: string): string | null => {
        const methodLower = javaMethodName.toLowerCase();
        const httpMethodUpper = httpMethod.toUpperCase();

        // Rule 1: If java_method_name contains "create" AND method is POST -> map to "create"
        if (methodLower.includes("create") && httpMethodUpper === "POST") {
          return "create";
        }

        // Rule 2: If java_method_name contains "get" AND method is GET -> map to "read"
        if (methodLower.includes("get") && httpMethodUpper === "GET") {
          return "read";
        }

        // Additional fuzzy logic rules
        if (methodLower.includes("update") || methodLower.includes("edit")) {
          return "edit";
        }

        if (methodLower.includes("delete") && httpMethodUpper === "DELETE") {
          return "delete";
        }

        if (methodLower.includes("copy")) {
          return "copy";
        }

        // If unsure, return null (will result in empty rolePath)
        return null;
      };

      // Helper function to find best matching policy path using fuzzy logic
      const findBestPolicyMatch = (apiPath: string, policyPaths: string[]): string | null => {
        // Extract key parts from API path (remove context_path, version, and common prefixes)
        const apiPathClean = apiPath
          .toLowerCase()
          .replace(/^\/ctrm-api\/api\//, "")
          .replace(/\/v\d+\//, "/")
          .split("/")[0]; // Get the first meaningful segment

        // Find policy paths that match
        for (const policyPath of policyPaths) {
          const policyPathClean = policyPath.toLowerCase().replace(/^\//, "");
          
          // Direct match
          if (policyPathClean === apiPathClean) {
            return policyPath;
          }

          // Partial match (e.g., "trade" matches "physicaltrade")
          if (apiPathClean.includes(policyPathClean) || policyPathClean.includes(apiPathClean)) {
            return policyPath;
          }
        }

        return null;
      };

      // Generate combined JSON with unique entries
      const resultsMap = new Map<string, GeneratedItem>();

      for (const apiEntry of apiMonitor) {
        const fullPath = `${apiEntry.context_path}${apiEntry.api}`;
        
        // Skip if already processed
        if (resultsMap.has(fullPath)) {
          continue;
        }

        // Determine the access type based on method
        const accessType = determineAccessType(apiEntry.java_method_name, apiEntry.method);

        // Find best matching policy
        const policyPaths = Object.keys(policyData);
        const bestPolicyMatch = findBestPolicyMatch(fullPath, policyPaths);

        let rolePath: string[] = [];

        if (bestPolicyMatch && accessType) {
          const policyEntry = policyData[bestPolicyMatch];
          
          // Check if the policy has the Grid Access with the determined access type
          if (policyEntry["Grid Access"] && policyEntry["Grid Access"][accessType]) {
            rolePath = [`${bestPolicyMatch}.Grid Access.${accessType}`];
          }
        }

        // Add to results (with empty rolePath if unsure)
        resultsMap.set(fullPath, {
          path: fullPath,
          rolePath,
        });
      }

      const results = Array.from(resultsMap.values());

      setGeneratedJson(results);
      toast({
        title: "Processing Complete",
        description: `Generated ${results.length} unique entries`,
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
