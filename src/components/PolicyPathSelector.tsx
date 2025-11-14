import { useMemo } from "react";
import Fuse from "fuse.js";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface PolicyPathSelectorProps {
  path: string;
  policyPaths: string[];
  value: string | null;
  onChange: (selectedValue: string) => void;
}

export const PolicyPathSelector = ({ path, policyPaths, value, onChange }: PolicyPathSelectorProps) => {
  const bestMatch = useMemo(() => {
    if (value) return value; // If a value is already set, use it.
    if (!path || policyPaths.length === 0) return null;

    const fuse = new Fuse(policyPaths, {
      includeScore: true,
      threshold: 0.6, // Adjust this threshold as needed
    });

    const results = fuse.search(path);
    if (results.length > 0) {
      // The best match is the first result
      return results[0].item;
    }

    return null;
  }, [path, policyPaths, value]);

  // Set the initial value if it's not already set
  if (bestMatch && !value) {
    onChange(bestMatch);
  }

  return (
    <Select onValueChange={onChange} value={value ?? ""}>
      <SelectTrigger>
        <SelectValue placeholder="Select a path" />
      </SelectTrigger>
      <SelectContent>
        {policyPaths.map((policyPath) => (
          <SelectItem key={policyPath} value={policyPath}>
            {policyPath}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
