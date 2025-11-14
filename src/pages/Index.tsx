import { useState, useCallback } from "react";
import { Upload, Download, FileJson, FileText, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { FileUploadZone } from "@/components/FileUploadZone";
import { ResultDisplay } from "@/components/ResultDisplay";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

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

interface ProcessingStats {
  totalEntries: number;
  processedEntries: number;
  matchedRoutes: number;
  unmatchedRoutes: number;
  highConfidence: number; // Confidence > 80%
  lowConfidence: number;  // Confidence 50-80%
  currentPhase: string;
  timeElapsed: number;
}

interface GeneratedItem {
  path: string;
  rolePath: string[];
  methodType?: string;
  javaMethodName?: string;
}

const Index = () => {
  const [apiFile, setApiFile] = useState<File | null>(null);
  const [policyFile, setPolicyFile] = useState<File | null>(null);
  const [generatedJson, setGeneratedJson] = useState<GeneratedItem[] | null>(null);
  const [policyData, setPolicyData] = useState<Record<string, PolicyEntry> | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [processingStatus, setProcessingStatus] = useState("");
  const [showProcessingDialog, setShowProcessingDialog] = useState(false);
  const [processingStats, setProcessingStats] = useState<ProcessingStats>({
    totalEntries: 0,
    processedEntries: 0,
    matchedRoutes: 0,
    unmatchedRoutes: 0,
    highConfidence: 0,
    lowConfidence: 0,
    currentPhase: "",
    timeElapsed: 0,
  });
  const [processingStartTime, setProcessingStartTime] = useState<number>(0);
  const { toast } = useToast();

  const handleDataChange = useCallback((updatedData: GeneratedItem[]) => {
    setGeneratedJson(updatedData);
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

    setIsProcessing(true);
    setShowProcessingDialog(true);
    setProcessingProgress(0);
    setProcessingStatus("Reading files...");
    setProcessingStartTime(Date.now());
    setProcessingStats({
      totalEntries: 0,
      processedEntries: 0,
      matchedRoutes: 0,
      unmatchedRoutes: 0,
      highConfidence: 0,
      lowConfidence: 0,
      currentPhase: "Initializing",
      timeElapsed: 0,
    });

    try {
      // Read and parse API monitor file
      setProcessingStats(prev => ({ ...prev, currentPhase: "Reading API Monitor File" }));
      const apiText = await apiFile.text();
      setProcessingProgress(10);
      setProcessingStatus("Parsing API monitor file...");
      
      setProcessingStats(prev => ({ ...prev, currentPhase: "Parsing API Monitor File" }));
      const apiData = JSON.parse(apiText);
      const apiMonitor: ApiMonitorEntry[] = apiData.xceler_api_monitor || [];
      setProcessingProgress(20);
      setProcessingStats(prev => ({ ...prev, totalEntries: apiMonitor.length }));

      // Read and parse policy file
      setProcessingStatus("Reading policy file...");
      setProcessingStats(prev => ({ ...prev, currentPhase: "Reading Policy File" }));
      const policyText = await policyFile.text();
      setProcessingProgress(30);
      
      setProcessingStatus("Parsing policy file...");
      setProcessingStats(prev => ({ ...prev, currentPhase: "Parsing Policy File" }));
      const parsedPolicyData: Record<string, PolicyEntry> = JSON.parse(policyText);
      setPolicyData(parsedPolicyData);
      setProcessingProgress(40);

      // Enhanced helper function to determine access type based on java_method_name and method
      // Rules are checked in PRIORITY ORDER - first match wins
      const determineAccessType = (javaMethodName: string, httpMethod: string): string | null => {
        if (!javaMethodName) return null;
        const method = javaMethodName.toString().toLowerCase();
        const http = httpMethod ? httpMethod.toUpperCase() : "";

        // PRIORITY ORDER - First match wins!
        
        // Rule 1 (HIGHEST PRIORITY): copy with POST/GET → create
        if (method.includes('copy') && (http === 'POST' || http === 'GET')) {
          return 'create';
        }

        // Rule 2: delete with POST/GET/DELETE → edit
        if (method.includes('delete') && (http === 'POST' || http === 'GET' || http === 'DELETE')) {
          return 'edit';
        }

        // Rule 3: import with POST/GET → create
        if (method.includes('import') && (http === 'POST' || http === 'GET')) {
          return 'create';
        }

        // Rule 4: unpost, deallocate with POST/GET → create
        if ((method.includes('unpost') || method.includes('deallocate')) && 
            (http === 'POST' || http === 'GET')) {
          return 'create';
        }

        // Rule 5: save with POST/GET → create
        if (method.includes('save') && (http === 'POST' || http === 'GET')) {
          return 'create';
        }

        // Rule 6: update with POST/GET → edit (BEFORE 'get' rule to avoid conflict)
        if (method.includes('update') && (http === 'POST' || http === 'GET')) {
          return 'edit';
        }

        // Rule 7: load, check with POST/GET → read
        if ((method.includes('load') || method.includes('check')) && 
            (http === 'POST' || http === 'GET')) {
          return 'read';
        }

        // Rule 8: is with POST/GET → read
        if (method.includes('is') && (http === 'POST' || http === 'GET')) {
          return 'read';
        }

        // Rule 9: get with GET/POST → read (AFTER update/import to avoid conflicts)
        if (method.includes('get') && (http === 'GET' || http === 'POST')) {
          return 'read';
        }

        // Fallback: HTTP method-based mapping
        if (http === 'DELETE') return 'edit';
        if (http === 'PUT') return 'edit';
        if (http === 'POST') return 'create';
        if (http === 'GET') return 'read';

        return null;
      };// Enhanced findBestPolicyMatch with Rule 9: Close matching logic
const findBestPolicyMatchWithScore = (apiPath: string, javaMethodName: string, policyPaths: string[]): { path: string | null; score: number } => {
  if (!apiPath || !policyPaths || policyPaths.length === 0) return { path: null, score: 1.0 };

  // Normalize apiPath to remove context, api prefix, version and leading/trailing slashes
  let apiClean = apiPath.toLowerCase()
    .replace(/^\/?ctrm-api\/api\/?/, "")
    .replace(/^\/?api\/?/, "")
    .replace(/\/v\d+(\.\d+)?\//g, "/")
    .replace(/^\/|\/$/g, "");

  // Extract keywords from javaMethodName for Rule 9
  const methodLower = (javaMethodName || '').toLowerCase();
  const methodKeywords = methodLower.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_\-\.]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  // Make tokens of api path
  const apiTokens = apiClean.split(/[\/\-\._]+/).filter(Boolean);

  // helper to compute longest common substring length
  const lcsLen = (a: string, b: string) => {
    const m = a.length, n = b.length;
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
      return { path: policyPath, score: 0.0 };
    }

    // token overlap score
    const overlap = apiTokens.reduce((acc, t) => acc + (pTokens.includes(t) ? 1 : 0), 0);

    // Rule 9: Check if method keywords match policy path keywords
    const methodMatchScore = methodKeywords.reduce((acc, keyword) => {
      if (keyword.length > 3 && pClean.includes(keyword)) {
        return acc + 5; // Bonus points for method name matching policy path
      }
      return acc;
    }, 0);

    // longest common substring score
    const lcs = lcsLen(apiClean, pClean);

    // score weights: overlap * 10 + lcs length + method match bonus
    const score = overlap * 10 + lcs + methodMatchScore;
    const tieBreak = pClean.length;

    if (!best || score > best.score || (score === best.score && tieBreak > best.tieBreak)) {
      best = { path: policyPath, score, tieBreak };
    }
  }

  if (best) {
    // Normalize score to 0-1 range
    const maxPossibleScore = apiTokens.length * 10 + apiClean.length + 50; // +50 for potential method bonus
    const normalizedScore = 1 - (best.score / maxPossibleScore);
    return { path: best.path, score: 1 - normalizedScore };
  }

  return { path: null, score: 1.0 };
};

const findBestPolicyMatch = (apiPath: string, javaMethodName: string, policyPaths: string[]): string | null => {
  const result = findBestPolicyMatchWithScore(apiPath, javaMethodName, policyPaths);
  // Only return if confidence > 80% (score < 0.2)
  return result.score < 0.2 ? result.path : null;
};

      setProcessingStatus("Generating mappings...");
      setProcessingProgress(50);
      setProcessingStats(prev => ({ ...prev, currentPhase: "Generating Route Mappings" }));

      // Generate combined JSON with unique entries
      const resultsMap = new Map<string, GeneratedItem>();
      const totalEntries = apiMonitor.length;
      let processedCount = 0;
      let matchedCount = 0;
      let unmatchedCount = 0;
      let highConfidenceCount = 0;
      let lowConfidenceCount = 0;

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

        // Find best matching policy with confidence score
        const policyPaths = Object.keys(parsedPolicyData);
        const matchResult = findBestPolicyMatchWithScore(fullPath, apiEntry.java_method_name, policyPaths);
        const bestPolicyMatch = matchResult.score < 0.2 ? matchResult.path : null; // Only use if confidence > 80%
        
        // Track matched/unmatched and confidence levels
        if (bestPolicyMatch) {
          matchedCount++;
          if (matchResult.score < 0.2) {
            highConfidenceCount++; // > 80% confidence
          } else {
            lowConfidenceCount++; // 50-80% confidence
          }
        } else {
          unmatchedCount++;
        }

        let rolePath: string[] = [];

        if (bestPolicyMatch && accessType) {
          const policyEntry = parsedPolicyData[bestPolicyMatch];
          
          // Check if the policy has the Grid Access with the determined access type
          if (policyEntry["Grid Access"] && policyEntry["Grid Access"][accessType]) {
              rolePath = [`${bestPolicyMatch}.Grid Access.${accessType}`];
            } else {
              // Try Action keys and Toolbar with synonyms
              const synonyms: Record<string, string[]> = {
                create: ["create", "save", "createBulk", "saveAndActualizeCost", "import", "add", "copy"],
                edit: ["edit", "update", "makeDefault", "delete", "remove"],
                delete: ["delete", "remove"],
                copy: ["copy", "copyBL", "copyQualityDetails", "copyShippingDetails"],
                read: ["read", "get", "view", "load", "check", "is"],
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
              const fromWidgets = trySection("widgets");

              const chosen = fromAction || fromToolbar || fromWidgets;
              if (chosen) rolePath = [chosen];
            }
        }

        // Add to results (with empty rolePath if not found, but will still have permissions based on accessType)
        resultsMap.set(fullPath, {
          path: fullPath,
          rolePath,
          methodType: apiEntry.method || 'UNKNOWN',
          javaMethodName: apiEntry.java_method_name || '',
        });

        // Update progress
        processedCount++;
        const progress = 50 + Math.floor((processedCount / totalEntries) * 40);
        const timeElapsed = Math.floor((Date.now() - processingStartTime) / 1000);
        setProcessingProgress(progress);
        setProcessingStatus(`Processing entries: ${processedCount}/${totalEntries}`);
        setProcessingStats({
          totalEntries,
          processedEntries: processedCount,
          matchedRoutes: matchedCount,
          unmatchedRoutes: unmatchedCount,
          highConfidence: highConfidenceCount,
          lowConfidence: lowConfidenceCount,
          currentPhase: "Mapping Routes",
          timeElapsed,
        });
        
        // Allow UI to update every 50 entries for more responsive feedback
        if (processedCount % 50 === 0) {
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }

      setProcessingStatus("Finalizing...");
      setProcessingProgress(95);
      setProcessingStats(prev => ({ ...prev, currentPhase: "Finalizing Results" }));

      const results = Array.from(resultsMap.values());

      setGeneratedJson(results);
      setProcessingProgress(100);
      setProcessingStatus("Complete!");
      
      const finalTimeElapsed = Math.floor((Date.now() - processingStartTime) / 1000);
      setProcessingStats(prev => ({ 
        ...prev, 
        currentPhase: "Complete!",
        timeElapsed: finalTimeElapsed,
      }));
      
      toast({
        title: "Processing Complete",
        description: `Generated ${results.length} unique entries. High Confidence: ${highConfidenceCount}, Low/Unmatched: ${unmatchedCount}`,
      });
      
      // Close dialog after a brief delay
      setTimeout(() => {
        setShowProcessingDialog(false);
      }, 2000);
    } catch (error) {
      console.error("Processing error:", error);
      toast({
        title: "Processing Failed",
        description: error instanceof Error ? error.message : "Failed to process files",
        variant: "destructive",
      });
      setShowProcessingDialog(false);
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

        {/* Processing Dialog */}
        <Dialog open={showProcessingDialog} onOpenChange={setShowProcessingDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                Processing Files
              </DialogTitle>
              <DialogDescription>
                Real-time processing statistics
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="font-medium">{processingStats.currentPhase}</span>
                  <span className="text-muted-foreground">{processingProgress}%</span>
                </div>
                <Progress value={processingProgress} className="w-full" />
              </div>
              
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="space-y-1">
                  <p className="text-muted-foreground">Total Entries</p>
                  <p className="text-2xl font-bold">{processingStats.totalEntries}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground">Processed</p>
                  <p className="text-2xl font-bold text-blue-600">{processingStats.processedEntries}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground">High Confidence</p>
                  <p className="text-2xl font-bold text-green-600">{processingStats.highConfidence}</p>
                  <p className="text-xs text-muted-foreground">&gt; 80%</p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground">Low/Unmatched</p>
                  <p className="text-2xl font-bold text-amber-600">{processingStats.lowConfidence + processingStats.unmatchedRoutes}</p>
                  <p className="text-xs text-muted-foreground">&lt; 80%</p>
                </div>
              </div>
              
              <div className="pt-2 border-t">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Time Elapsed</span>
                  <span className="font-mono font-medium">{processingStats.timeElapsed}s</span>
                </div>
              </div>
              
              <div className="text-xs text-center text-muted-foreground">
                {processingStatus}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default Index;
