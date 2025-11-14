import { useState, useCallback } from "react";
import { Upload, Download, FileJson, FileText, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { FileUploadZone } from "@/components/FileUploadZone";
import { ResultDisplay } from "@/components/ResultDisplay";
import { Progress } from "@/components/ui/progress";

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
  const [policyData, setPolicyData] = useState<Record<string, PolicyEntry> | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [processingStatus, setProcessingStatus] = useState("");
  const { toast } = useToast();

  const handleDataChange = useCallback((updatedData: GeneratedItem[]) => {
    setGeneratedJson(updatedData);
    // Cache the data in localStorage
    try {
      localStorage.setItem('generatedJsonCache', JSON.stringify(updatedData));
      localStorage.setItem('generatedJsonCacheTime', Date.now().toString());
    } catch (error) {
      console.error('Failed to cache data:', error);
    }
  }, []);

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

    // Check cache first
    const cacheKey = `${apiFile.name}_${policyFile.name}_${apiFile.lastModified}_${policyFile.lastModified}`;
    const cachedData = localStorage.getItem(cacheKey);
    const cacheTime = localStorage.getItem(`${cacheKey}_time`);
    
    if (cachedData && cacheTime) {
      const cacheAge = Date.now() - parseInt(cacheTime);
      // Use cache if less than 1 hour old
      if (cacheAge < 3600000) {
        try {
          const parsed = JSON.parse(cachedData);
          setPolicyData(parsed.policyData);
          setGeneratedJson(parsed.generatedJson);
          toast({
            title: "Loaded from Cache",
            description: "Previously processed data loaded instantly",
          });
          return;
        } catch (error) {
          console.error('Cache parse error:', error);
        }
      }
    }

    setIsProcessing(true);
    setProcessingProgress(0);
    setProcessingStatus("Reading files...");

    try {
      // Read and parse API monitor file
      const apiText = await apiFile.text();
      setProcessingProgress(10);
      setProcessingStatus("Parsing API monitor file...");
      
      const apiData = JSON.parse(apiText);
      const apiMonitor: ApiMonitorEntry[] = apiData.xceler_api_monitor || [];
      setProcessingProgress(20);

      // Read and parse policy file
      setProcessingStatus("Reading policy file...");
      const policyText = await policyFile.text();
      setProcessingProgress(30);
      
      setProcessingStatus("Parsing policy file...");
      const parsedPolicyData: Record<string, PolicyEntry> = JSON.parse(policyText);
      setPolicyData(parsedPolicyData);
      setProcessingProgress(40);

      // Helper function to determine access type based on java_method_name and method
      // Replace the old determineAccessType with this improved function
      const determineAccessType = (javaMethodName: string, httpMethod: string): string | null => {
        if (!javaMethodName) return null;
        const method = javaMethodName.toString();

        // Convert camelCase / PascalCase to space separated words and lower-case
        const spaced = method.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
                             .replace(/[_\-\.]+/g, " ")
                             .toLowerCase();

        const tokens = spaced.split(/\s+/).filter(Boolean); // exact tokens

        const has = (w: string) => tokens.includes(w);

        const http = httpMethod ? httpMethod.toUpperCase() : "";

        // Use HTTP method first for obvious mappings
        if (http === "DELETE") return "delete";
        if (http === "PUT") return "edit"; // PUT usually edits
        if (http === "POST") {
          // POST is usually create/save, but if method token implies delete/copy/edit treat accordingly
          if (has("delete")) return "delete";
          if (has("copy")) return "copy";
          if (has("edit") || has("update")) return "edit";
          if (has("create") || has("save") || has("import") || has("add")) return "create";
          return "create";
        }
        if (http === "GET") {
          // GET is usually read; some GET endpoints perform copy/download but these are special cases
          if (has("delete")) return "delete";
          if (has("copy")) return "copy";
          // Some methods named 'isEditable' or 'isSomething' - treat as read/flag-check
          return "read";
        }

        // Fallback: token inspection when HTTP is not decisive
        if (has("delete")) return "delete";
        if (has("copy")) return "copy";
        if (has("edit") || has("update")) return "edit";
        if (has("create") || has("save") || has("import") || has("add")) return "create";
        if (has("get") || has("find") || has("fetch") || has("is") || has("list")) return "read";

        return null;
      };

// Replace old findBestPolicyMatch with this function
const findBestPolicyMatch = (apiPath: string, policyPaths: string[]): string | null => {
  if (!apiPath || !policyPaths || policyPaths.length === 0) return null;

  // Normalize apiPath to remove context, api prefix, version and leading/trailing slashes
  let apiClean = apiPath.toLowerCase()
    .replace(/^\/?ctrm-api\/api\/?/, "")   // remove leading /ctrm-api/api/
    .replace(/^\/?api\/?/, "")             // or /api/ if ctrm-api not present
    .replace(/\/v\d+(\.\d+)?\//g, "/")     // remove simple /v1/, /v2/ etc.
    .replace(/^\/|\/$/g, "");              // trim "/" ends

  // Make tokens of api path
  const apiTokens = apiClean.split(/[\/\-\._]+/).filter(Boolean);

  // helper to compute longest common substring length
  const lcsLen = (a: string, b: string) => {
    const m = a.length, n = b.length;
    // small DP optimized for short strings
    let max = 0;
    const dp = new Array(n + 1).fill(0);
    for (let i = 1; i <= m; i++) {
      for (let j = n; j >= 1; j--) {
        if (a[i - 1] === b[j - 1]) {
          dp[j] = dp[j - 1] + 1;
          if (dp[j] > max) max = dp[j];
        } else {
          dp[j] = 0;
        }
      }
    }
    return max;
  };

  let best: { path: string; score: number; tieBreak: number } | null = null;

  for (const policyPath of policyPaths) {
    const pClean = policyPath.toLowerCase().replace(/^\/|\/$/g, "");
    const pTokens = pClean.split(/[\/\-\._]+/).filter(Boolean);

    // exact match
    if (pClean === apiClean) {
      return policyPath;
    }

    // token overlap score
    const overlap = apiTokens.reduce((acc, t) => acc + (pTokens.includes(t) ? 1 : 0), 0);

    // longest common substring score (helps for partial matches like "actualization" vs "getallblinfo")
    const lcs = lcsLen(apiClean, pClean);

    // score weights: overlap * 10 + lcs length; tie-breaker by longer policy path (more specific)
    const score = overlap * 10 + lcs;
    const tieBreak = pClean.length;

    if (!best || score > best.score || (score === best.score && tieBreak > best.tieBreak)) {
      best = { path: policyPath, score, tieBreak };
    }
  }

  return best ? best.path : null;
};

      setProcessingStatus("Generating mappings...");
      setProcessingProgress(50);

      // Generate combined JSON with unique entries
      const resultsMap = new Map<string, GeneratedItem>();
      const totalEntries = apiMonitor.length;
      let processedCount = 0;

      for (const apiEntry of apiMonitor) {
       // when building fullPath inside loop, replace current line with this block
       let fullPath = `${apiEntry.context_path || ""}${apiEntry.api || ""}`;

       // normalize slashes and remove duplicated slashes, ensure leading slash
       fullPath = fullPath.replace(/\/{2,}/g, "/");
       if (!fullPath.startsWith("/")) fullPath = "/" + fullPath;
       if (fullPath.length > 1 && fullPath.endsWith("/")) fullPath = fullPath.slice(0, -1);
        
        // Skip if already processed
        if (resultsMap.has(fullPath)) {
          continue;
        }

        // Determine the access type based on method
        const accessType = determineAccessType(apiEntry.java_method_name, apiEntry.method);

        // Find best matching policy
        const policyPaths = Object.keys(parsedPolicyData);
        const bestPolicyMatch = findBestPolicyMatch(fullPath, policyPaths);

        let rolePath: string[] = [];

        if (bestPolicyMatch && accessType) {
          const policyEntry = parsedPolicyData[bestPolicyMatch];
          
          // Check if the policy has the Grid Access with the determined access type
          if (policyEntry["Grid Access"] && policyEntry["Grid Access"][accessType]) {
              rolePath = [`${bestPolicyMatch}.Grid Access.${accessType}`];
            } else {
              // 2) Try Action keys and Toolbar with synonyms
              const synonyms: Record<string, string[]> = {
                create: ["create", "save", "createBulk", "saveAndActualizeCost", "import", "add"],
                edit: ["edit", "update", "makeDefault"],
                delete: ["delete", "remove"],
                copy: ["copy", "copyBL", "copyQualityDetails", "copyShippingDetails"],
                read: ["read", "get", "view"],
              };

              const trySection = (sectionName: string): string | null => {
                const sec = policyEntry[sectionName];
                if (!sec || typeof sec !== "object") return null;
                // direct key match
                if (sec[accessType]) return `${bestPolicyMatch}.${sectionName}.${accessType}`;
                // synonyms
                const candidates = synonyms[accessType] || [];
                for (const c of candidates) {
                  if (sec[c]) return `${bestPolicyMatch}.${sectionName}.${c}`;
                }
                // fallback: pick any boolean-like key in section (take the first) if section has something
                const keys = Object.keys(sec);
                if (keys.length > 0) return `${bestPolicyMatch}.${sectionName}.${keys[0]}`;
                return null;
              };

              const fromAction = trySection("Action");
              const fromToolbar = trySection("Toolbar");
              const fromWidgets = trySection("widgets"); // sometimes widgets hold permissions

              const chosen = fromAction || fromToolbar || fromWidgets;
              if (chosen) rolePath = [chosen];
            }
        }

        // Add to results (with empty rolePath if unsure)
        resultsMap.set(fullPath, {
          path: fullPath,
          rolePath,
        });

        // Update progress
        processedCount++;
        const progress = 50 + Math.floor((processedCount / totalEntries) * 40);
        setProcessingProgress(progress);
        setProcessingStatus(`Processing entries: ${processedCount}/${totalEntries}`);
        
        // Allow UI to update every 100 entries
        if (processedCount % 100 === 0) {
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }

      setProcessingStatus("Finalizing...");
      setProcessingProgress(95);

      const results = Array.from(resultsMap.values());

      // Cache the results
      try {
        localStorage.setItem(cacheKey, JSON.stringify({
          policyData: parsedPolicyData,
          generatedJson: results
        }));
        localStorage.setItem(`${cacheKey}_time`, Date.now().toString());
      } catch (error) {
        console.error('Failed to cache results:', error);
      }

      setGeneratedJson(results);
      setProcessingProgress(100);
      setProcessingStatus("Complete!");
      
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
      setTimeout(() => {
        setProcessingProgress(0);
        setProcessingStatus("");
      }, 2000);
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
    setPolicyData(null);
    setProcessingProgress(0);
    setProcessingStatus("");
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

              <Button
                onClick={clearAll}
                variant="outline"
                size="lg"
                disabled={!apiFile && !policyFile && !generatedJson}
              >
                Clear All
              </Button>
            </div>
            
            {isProcessing && (
              <div className="mt-4 space-y-2">
                <Progress value={processingProgress} className="w-full" />
                <p className="text-sm text-muted-foreground text-center">
                  {processingStatus}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {generatedJson && policyData && (
          <ResultDisplay data={generatedJson} policyData={policyData} onDataChange={handleDataChange} />
        )}
      </div>
    </div>
  );
};

export default Index;
