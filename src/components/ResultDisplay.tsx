import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Copy, CheckCircle2, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import Fuse from "fuse.js";

interface GeneratedItem {
  path: string;
  rolePath: string[];
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
    route: string;
    roleBase: string | null;
    baseInferred: boolean;
    create: boolean;
    read: boolean;
    edit: boolean;
    selected: boolean;
  };

  const [rows, setRows] = useState<EditableRow[]>([]);
  const [selectAll, setSelectAll] = useState<boolean>(false);
  
  // Get all available routes from policy data
  const policyRoutes = useMemo(() => {
    return Object.keys(policyData || {});
  }, [policyData]);

  // Fuzzy search to find best matching route for a given path
  const findBestRouteMatch = (apiPath: string): string => {
    if (!apiPath || policyRoutes.length === 0) return "";
    
    // Normalize apiPath
    const apiClean = apiPath
      .toLowerCase()
      .replace(/^\/?ctrm-api\/api\/?/, "")
      .replace(/^\/?api\/?/, "")
      .replace(/\/v\d+(\.\d+)?\//g, "/")
      .replace(/^\/|\/$/g, "");

    // Use Fuse.js for fuzzy search
    const fuse = new Fuse(policyRoutes, {
      includeScore: true,
      threshold: 0.4,
      keys: [""],
    });

    const results = fuse.search(apiClean);
    if (results.length > 0) {
      return results[0].item;
    }

    return policyRoutes[0] || "";
  };

  const inferRoleBaseFromRoute = (route: string): string | null => {
    if (!route) return null;
    return `${route}.Grid Access`;
  };

  useEffect(() => {
    if (data.length === 0) return;
    
    setRows(
      data.map((item) => {
        // Derive route and roleBase from existing rolePath entries
        let route = "";
        let roleBase: string | null = null;
        
        if (item.rolePath && item.rolePath.length > 0) {
          const first = item.rolePath[0];
          // Extract route from rolePath (e.g., "/route.Grid Access.create" -> "/route")
          const gridAccessIndex = first.indexOf(".Grid Access");
          if (gridAccessIndex !== -1) {
            route = first.slice(0, gridAccessIndex);
            roleBase = first.slice(0, first.lastIndexOf("."));
          }
        }
        
        // If no route found, use fuzzy search to find best match
        if (!route) {
          route = findBestRouteMatch(item.path);
          roleBase = inferRoleBaseFromRoute(route);
        }

        return {
          path: item.path,
          route,
          roleBase,
          baseInferred: !(item.rolePath && item.rolePath.length > 0),
          create: item.rolePath?.some((rp) => /\.create$/i.test(rp)) ?? false,
          read: item.rolePath?.some((rp) => /\.read$/i.test(rp)) ?? false,
          edit: item.rolePath?.some((rp) => /\.edit$/i.test(rp)) ?? false,
          selected: false,
        };
      }),
    );
    setSelectAll(false);
  }, [data]);

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

  const jsonOutput = useMemo(() => JSON.stringify({ generatedJson: resolvedData }, null, 2), [resolvedData]);

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
        <div className="mb-2 text-sm text-muted-foreground">
          {rows.filter((r) => r.selected).length > 0
            ? `${rows.filter((r) => r.selected).length} selected of ${rows.length}`
            : `No rows selected. Actions apply to all ${rows.length}.`}
        </div>
        <ScrollArea className="h-[500px] w-full rounded-md border bg-muted/30">
          <Table className="min-w-full">
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">
                  <Checkbox
                    checked={selectAll}
                    onCheckedChange={(checked) => {
                      const isChecked = Boolean(checked);
                      setSelectAll(isChecked);
                      setRows((prev) => prev.map((r) => ({ ...r, selected: isChecked })));
                    }}
                    aria-label="Select all"
                  />
                </TableHead>
                <TableHead className="w-[30%]">Path</TableHead>
                <TableHead className="w-[30%]">Route</TableHead>
                <TableHead className="w-[10%]">Create</TableHead>
                <TableHead className="w-[10%]">Read</TableHead>
                <TableHead className="w-[10%]">Edit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, idx) => (
                <TableRow key={idx} data-state={row.selected ? "selected" : undefined}>
                  <TableCell className="w-12">
                    <Checkbox
                      checked={row.selected}
                      onCheckedChange={(checked) => {
                        const isChecked = Boolean(checked);
                        setRows((prev) => {
                          const next = [...prev];
                          next[idx] = { ...next[idx], selected: isChecked };
                          const allSelected = next.length > 0 && next.every((r) => r.selected);
                          setSelectAll(allSelected);
                          return next;
                        });
                      }}
                      aria-label={`Select row ${idx + 1}`}
                    />
                  </TableCell>
                  <TableCell className="align-top">
                    <Input
                      value={row.path}
                      onChange={(e) => {
                        const value = e.target.value;
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
                      }}
                    />
                  </TableCell>
                  <TableCell className="align-top">
                    <Combobox
                      value={row.route}
                      onValueChange={(value) => {
                        setRows((prev) => {
                          const next = [...prev];
                          const updated: EditableRow = { 
                            ...next[idx], 
                            route: value,
                            roleBase: inferRoleBaseFromRoute(value),
                            baseInferred: false
                          };
                          next[idx] = updated;
                          return next;
                        });
                      }}
                      options={policyRoutes}
                      placeholder="Select route"
                      emptyMessage="No route found."
                    />
                  </TableCell>
                  <TableCell className="align-top">
                    <Checkbox
                      checked={row.create}
                      onCheckedChange={(checked) => {
                        const isChecked = Boolean(checked);
                        setRows((prev) => {
                          const next = [...prev];
                          const updated: EditableRow = { ...next[idx], create: isChecked };
                          if (!updated.roleBase) {
                            updated.route = findBestRouteMatch(updated.path);
                            updated.roleBase = inferRoleBaseFromRoute(updated.route);
                            updated.baseInferred = true;
                          }
                          next[idx] = updated;
                          return next;
                        });
                      }}
                      aria-label={`Create access for row ${idx + 1}`}
                    />
                  </TableCell>
                  <TableCell className="align-top">
                    <Checkbox
                      checked={row.read}
                      onCheckedChange={(checked) => {
                        const isChecked = Boolean(checked);
                        setRows((prev) => {
                          const next = [...prev];
                          const updated: EditableRow = { ...next[idx], read: isChecked };
                          if (!updated.roleBase) {
                            updated.route = findBestRouteMatch(updated.path);
                            updated.roleBase = inferRoleBaseFromRoute(updated.route);
                            updated.baseInferred = true;
                          }
                          next[idx] = updated;
                          return next;
                        });
                      }}
                      aria-label={`Read access for row ${idx + 1}`}
                    />
                  </TableCell>
                  <TableCell className="align-top">
                    <Checkbox
                      checked={row.edit}
                      onCheckedChange={(checked) => {
                        const isChecked = Boolean(checked);
                        setRows((prev) => {
                          const next = [...prev];
                          const updated: EditableRow = { ...next[idx], edit: isChecked };
                          if (!updated.roleBase) {
                            updated.route = findBestRouteMatch(updated.path);
                            updated.roleBase = inferRoleBaseFromRoute(updated.route);
                            updated.baseInferred = true;
                          }
                          next[idx] = updated;
                          return next;
                        });
                      }}
                      aria-label={`Edit access for row ${idx + 1}`}
                    />
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
