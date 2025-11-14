import { useEffect, useMemo, useState, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Copy, CheckCircle2, Download, Info } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import Fuse from "fuse.js";

interface GeneratedItem {
  path: string;
  rolePath: string[];
  methodType?: string;
  javaMethodName?: string;
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

interface ResultDisplayProps {
  data: GeneratedItem[];
  policyData: Record<string, PolicyEntry>;
  onDataChange: (data: GeneratedItem[]) => void;
}

export const ResultDisplay = ({ data, policyData, onDataChange }: ResultDisplayProps) => {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  type EditableRow = {
    path: string;
    methodType: string;
    javaMethodName: string;
    route: string;
    roleBase: string | null;
    baseInferred: boolean;
    create: boolean;
    read: boolean;
    edit: boolean;
    selected: boolean;
    reasoning: string;
  };

  const [rows, setRows] = useState<EditableRow[]>([]);
  const [selectAll, setSelectAll] = useState<boolean>(false);
  
  // Get all available routes from policy data (memoized)
  const policyRoutes = useMemo(() => {
    return Object.keys(policyData || {});
  }, [policyData]);

  // Normalize text to handle all case types (memoized)
  const normalizeForMatching = useCallback((text: string): string => {
    return text
      // Convert camelCase/PascalCase to space-separated: "getUserInfo" -> "get User Info"
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      // Replace special chars with spaces
      .replace(/[_\-\.\/]+/g, " ")
      // Convert to lowercase and trim
      .toLowerCase()
      .trim()
      // Remove extra spaces
      .replace(/\s+/g, " ");
  }, []);

  // Fuzzy search to find best matching route for a given path (memoized)
  // Returns route only if confidence > 80% (score < 0.2)
  const findBestRouteMatch = useCallback((apiPath: string): string => {
    if (!apiPath || policyRoutes.length === 0) return "";
    
    // Normalize apiPath
    const apiClean = apiPath
      .toLowerCase()
      .replace(/^\/?ctrm-api\/api\/?/, "")
      .replace(/^\/?api\/?/, "")
      .replace(/\/v\d+(\.\d+)?\//g, "/")
      .replace(/^\/|\/$/g, "");

    // Create normalized versions for better matching
    const apiNormalized = normalizeForMatching(apiClean);
    
    // Prepare search data with normalized versions
    const searchData = policyRoutes.map(route => ({
      original: route,
      normalized: normalizeForMatching(route),
    }));

    // Use Fuse.js for fuzzy search on normalized text
    const fuse = new Fuse(searchData, {
      includeScore: true,
      threshold: 0.5,
      keys: ["normalized", "original"],
      ignoreLocation: true,
      findAllMatches: true,
    });

    const results = fuse.search(apiNormalized);
    
    // Only return if confidence > 80% (score < 0.2)
    // Lower score = better match in Fuse.js
    // Score 0.0 = 100% match, Score 0.2 = 80% match, Score 0.5 = 50% match
    if (results.length > 0 && results[0].score !== undefined && results[0].score < 0.2) {
      return results[0].item.original;
    }

    // Not confident enough, return empty string (will show red border)
    return "";
  }, [policyRoutes, normalizeForMatching]);

  // Generate reasoning for route and permission selection
  const generateReasoning = useCallback((
    path: string,
    methodType: string,
    javaMethodName: string,
    route: string,
    create: boolean,
    read: boolean,
    edit: boolean,
    baseInferred: boolean
  ): string => {
    const reasons: string[] = [];
    
    // Route reasoning
    if (route) {
      if (baseInferred) {
        reasons.push(`🔍 Route Auto-Selected: "${route}"`);
        
        // Check for fuzzy match reasons
        const methodLower = (javaMethodName || '').toLowerCase();
        const routeLower = route.toLowerCase();
        
        if (methodLower.includes(routeLower) || routeLower.includes(methodLower)) {
          reasons.push(`   • Method name "${javaMethodName}" closely matches route`);
        }
        
        const pathTokens = path.toLowerCase().split(/[\/\-\._]+/).filter(Boolean);
        const routeTokens = route.toLowerCase().split(/[\/\-\._]+/).filter(Boolean);
        const commonTokens = pathTokens.filter(t => routeTokens.includes(t));
        if (commonTokens.length > 0) {
          reasons.push(`   • Path contains matching keywords: ${commonTokens.join(', ')}`);
        }
      } else {
        reasons.push(`✅ Route: "${route}" (Manually selected or from policy)`);
      }
    } else {
      reasons.push(`❌ No route matched (Confidence < 80%)`);
      reasons.push(`   • Please select a route manually`);
    }
    
    reasons.push('');
    
    // Permission reasoning
    const method = (javaMethodName || '').toLowerCase();
    const http = (methodType || '').toUpperCase();
    
    if (create) {
      reasons.push(`✅ Permission: CREATE`);
      if (method.includes('copy')) {
        reasons.push(`   • Rule 1: Method "${javaMethodName}" contains copy`);
      } else if (method.includes('import')) {
        reasons.push(`   • Rule 3: Method "${javaMethodName}" contains import`);
      } else if (method.includes('unpost') || method.includes('deallocate')) {
        reasons.push(`   • Rule 4: Method "${javaMethodName}" contains unpost/deallocate`);
      } else if (method.includes('save')) {
        reasons.push(`   • Rule 5: Method "${javaMethodName}" contains save`);
      } else if (http === 'POST') {
        reasons.push(`   • HTTP method is POST → typically creates data`);
      }
    } else if (read) {
      reasons.push(`✅ Permission: READ`);
      if (method.includes('load') || method.includes('check')) {
        reasons.push(`   • Rule 7: Method "${javaMethodName}" contains load/check`);
      } else if (method.includes('is')) {
        reasons.push(`   • Rule 8: Method "${javaMethodName}" starts with is`);
      } else if (method.includes('get')) {
        reasons.push(`   • Rule 9: Method "${javaMethodName}" contains get`);
      } else if (http === 'GET') {
        reasons.push(`   • HTTP method is GET → typically reads data`);
      } else {
        reasons.push(`   • Default permission (safest option)`);
      }
    } else if (edit) {
      reasons.push(`✅ Permission: EDIT`);
      if (method.includes('delete')) {
        reasons.push(`   • Rule 2: Method "${javaMethodName}" contains delete`);
      } else if (method.includes('update')) {
        reasons.push(`   • Rule 6: Method "${javaMethodName}" contains update`);
      } else if (http === 'PUT') {
        reasons.push(`   • HTTP method is PUT → typically updates data`);
      } else if (http === 'DELETE') {
        reasons.push(`   • HTTP method is DELETE → mapped to edit`);
      }
    }
    
    reasons.push(`   • HTTP Method: ${http}`);
    reasons.push(`   • Java Method: ${javaMethodName}`);
    
    return reasons.join('\n');
  }, []);

  const inferRoleBaseFromRoute = useCallback((route: string): string | null => {
    if (!route) return null;
    return `${route}.Grid Access`;
  }, []);

  useEffect(() => {
    if (data.length === 0) return;
    
    const processedRows = data.map((item) => {
      // Derive route and roleBase from existing rolePath entries
      let route = "";
      let roleBase: string | null = null;
      let create = false;
      let read = false;
      let edit = false;
      let copy = false;
      let deleteAccess = false;
      const methodType = item.methodType || 'UNKNOWN';
      const javaMethodName = item.javaMethodName || '';
      
      if (item.rolePath && item.rolePath.length > 0) {
        const first = item.rolePath[0];
        // Extract route from rolePath (e.g., "/route.Grid Access.create" -> "/route")
        const gridAccessIndex = first.indexOf(".Grid Access");
        if (gridAccessIndex !== -1) {
          route = first.slice(0, gridAccessIndex);
          roleBase = first.slice(0, first.lastIndexOf("."));
        }
        
        // Determine THE SINGLE permission from rolePath (only one should be true)
        if (item.rolePath.some((rp) => /\.(create|save|import|add)$/i.test(rp))) {
          create = true;
        } else if (item.rolePath.some((rp) => /\.(read|get|view|load|check|is)$/i.test(rp))) {
          read = true;
        } else if (item.rolePath.some((rp) => /\.(edit|update)$/i.test(rp))) {
          edit = true;
        } else if (item.rolePath.some((rp) => /\.copy$/i.test(rp))) {
          copy = true;
        } else if (item.rolePath.some((rp) => /\.delete$/i.test(rp))) {
          deleteAccess = true;
        }
      }
      
      // If no route found, use fuzzy search to find best match
      if (!route) {
        route = findBestRouteMatch(item.path);
        roleBase = inferRoleBaseFromRoute(route);
      }

      // Default permission: Only ONE is selected based on the determined access type
      // If no permission was determined, default to 'read'
      if (!create && !read && !edit && !copy && !deleteAccess) {
        read = true; // Default to read if no specific permission determined
      }

      const reasoning = generateReasoning(
        item.path,
        methodType,
        javaMethodName,
        route,
        create,
        read,
        edit,
        !(item.rolePath && item.rolePath.length > 0)
      );

      return {
        path: item.path,
        methodType,
        javaMethodName,
        route,
        roleBase,
        baseInferred: !(item.rolePath && item.rolePath.length > 0),
        create,
        read,
        edit,
        selected: true, // Auto-select all rows by default
        reasoning,
      };
    });

    // Sort: empty routes first, then filled routes
    processedRows.sort((a, b) => {
      if (!a.route && b.route) return -1;
      if (a.route && !b.route) return 1;
      return 0;
    });

    setRows(processedRows);
    setSelectAll(true); // Select all by default
  }, [data, findBestRouteMatch, inferRoleBaseFromRoute, generateReasoning]);

  const resolvedData: GeneratedItem[] = useMemo(() => {
    const selected = rows.filter((r) => r.selected);
    const working = selected.length > 0 ? selected : rows;
    return working.map((r) => {
      const rolePath: string[] = [];
      if (r.roleBase) {
        if (r.create) rolePath.push(`${r.roleBase}.create`);
        if (r.read) rolePath.push(`${r.roleBase}.read`);
        if (r.edit) rolePath.push(`${r.roleBase}.edit`);
      }
      return { path: r.path, rolePath };
    });
  }, [rows]);

  const generateJSON = useCallback(() => {
    const selected = rows.filter((r) => r.selected);
    const working = selected.length > 0 ? selected : rows;
    const result = working.map((r) => {
      const rolePath: string[] = [];
      if (r.roleBase) {
        if (r.create) rolePath.push(`${r.roleBase}.create`);
        if (r.read) rolePath.push(`${r.roleBase}.read`);
        if (r.edit) rolePath.push(`${r.roleBase}.edit`);
      }
      return { path: r.path, rolePath };
    });
    return { generatedJson: result };
  }, [rows]);

  const jsonOutput = useMemo(() => {
    return JSON.stringify(generateJSON(), null, 2);
  }, [generateJSON]);

  const copyToClipboard = useCallback(() => {
    const output = JSON.stringify(generateJSON(), null, 2);
    navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({
      title: "Copied to Clipboard",
      description: "The JSON output has been copied",
    });
  }, [generateJSON, toast]);

  const handleSelectAll = useCallback((checked: boolean) => {
    setSelectAll(checked);
    setRows((prev) => prev.map((r) => ({ ...r, selected: checked })));
  }, []);

  const handleRowSelect = useCallback((idx: number, checked: boolean) => {
    setRows((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], selected: checked };
      const allSelected = next.length > 0 && next.every((r) => r.selected);
      setSelectAll(allSelected);
      return next;
    });
  }, []);

  const handlePathChange = useCallback((idx: number, value: string) => {
    setRows((prev) => {
      const next = [...prev];
      const updated: EditableRow = { ...next[idx], path: value };
      if (updated.baseInferred) {
        updated.route = findBestRouteMatch(value);
        updated.roleBase = inferRoleBaseFromRoute(updated.route);
      }
      next[idx] = updated;
      return next;
    });
  }, [findBestRouteMatch, inferRoleBaseFromRoute]);

  const handleRouteChange = useCallback((idx: number, value: string) => {
    setRows((prev) => {
      const next = [...prev];
      next[idx] = { 
        ...next[idx], 
        route: value,
        roleBase: inferRoleBaseFromRoute(value),
        baseInferred: false
      };
      return next;
    });
  }, [inferRoleBaseFromRoute]);

  const handlePermissionChange = useCallback((idx: number, permission: 'create' | 'read' | 'edit', checked: boolean) => {
    setRows((prev) => {
      const next = [...prev];
      const updated: EditableRow = { 
        ...next[idx], 
        // Only one permission can be true at a time
        create: permission === 'create' ? checked : false,
        read: permission === 'read' ? checked : false,
        edit: permission === 'edit' ? checked : false
      };
      
      // Set roleBase if not already set
      if (!updated.roleBase) {
        updated.route = findBestRouteMatch(updated.path);
        updated.roleBase = inferRoleBaseFromRoute(updated.route);
        updated.baseInferred = true;
      }
      next[idx] = updated;
      return next;
    });
  }, [findBestRouteMatch, inferRoleBaseFromRoute]);

  const downloadJson = useCallback(() => {
    const output = generateJSON();
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
  }, [generateJSON, toast]);

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
              {rows.filter(r => !r.route).length > 0 && (
                <span className="ml-2 text-red-600 font-medium">
                  ({rows.filter(r => !r.route).length} need route selection)
                </span>
              )}
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
        <div className="mb-2 text-sm text-muted-foreground">
          {rows.filter((r) => r.selected).length > 0
            ? `${rows.filter((r) => r.selected).length} selected of ${rows.length}`
            : `No rows selected. Actions apply to all ${rows.length}.`}
        </div>
        <ScrollArea className="h-[500px] w-full rounded-md border bg-muted/30">
          <Table className="min-w-full">
            <TableHeader className="sticky top-0 z-10 bg-background shadow-sm">
              <TableRow>
                <TableHead className="w-12 bg-background">
                  <Checkbox
                    checked={selectAll}
                    onCheckedChange={(checked) => handleSelectAll(Boolean(checked))}
                    aria-label="Select all"
                  />
                </TableHead>
                <TableHead className="w-[10%] bg-background">Method Type</TableHead>
                <TableHead className="w-[25%] bg-background">Path</TableHead>
                <TableHead className="w-[25%] bg-background">Route</TableHead>
                <TableHead className="w-[8%] bg-background">Create</TableHead>
                <TableHead className="w-[8%] bg-background">Read</TableHead>
                <TableHead className="w-[8%] bg-background">Edit</TableHead>
                <TableHead className="w-[6%] bg-background">Info</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, idx) => (
                <TableRow key={idx} data-state={row.selected ? "selected" : undefined}>
                  <TableCell className="w-12">
                    <Checkbox
                      checked={row.selected}
                      onCheckedChange={(checked) => handleRowSelect(idx, Boolean(checked))}
                      aria-label={`Select row ${idx + 1}`}
                    />
                  </TableCell>
                  <TableCell className="align-top">
                    <div className="font-mono text-xs bg-muted px-2 py-1 rounded">
                      {row.methodType}
                    </div>
                  </TableCell>
                  <TableCell className="align-top">
                    <Input
                      value={row.path}
                      onChange={(e) => handlePathChange(idx, e.target.value)}
                      className="font-mono text-xs"
                    />
                  </TableCell>
                  <TableCell className="align-top">
                    <Combobox
                      value={row.route}
                      onValueChange={(value) => handleRouteChange(idx, value)}
                      options={policyRoutes}
                      placeholder="Select route"
                      emptyMessage="No route found."
                      className={!row.route ? "border-2 border-red-500" : ""}
                    />
                  </TableCell>
                  <TableCell className="align-top text-center">
                    <Checkbox
                      checked={row.create}
                      onCheckedChange={(checked) => handlePermissionChange(idx, 'create', Boolean(checked))}
                      aria-label={`Create access for row ${idx + 1}`}
                    />
                  </TableCell>
                  <TableCell className="align-top text-center">
                    <Checkbox
                      checked={row.read}
                      onCheckedChange={(checked) => handlePermissionChange(idx, 'read', Boolean(checked))}
                      aria-label={`Read access for row ${idx + 1}`}
                    />
                  </TableCell>
                  <TableCell className="align-top text-center">
                    <Checkbox
                      checked={row.edit}
                      onCheckedChange={(checked) => handlePermissionChange(idx, 'edit', Boolean(checked))}
                      aria-label={`Edit access for row ${idx + 1}`}
                    />
                  </TableCell>
                  <TableCell className="align-top text-center">
                    <TooltipProvider>
                      <Tooltip delayDuration={0}>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                          >
                            <Info className="h-4 w-4 text-blue-600" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent 
                          side="left" 
                          className="max-w-md p-4 bg-slate-900 text-white"
                          sideOffset={5}
                        >
                          <pre className="text-xs whitespace-pre-wrap font-mono">
                            {row.reasoning}
                          </pre>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};
