import type { Category } from '../../../shared/types';
import { categoryColor } from './CategoryBadge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@renderer/components/ui/select';

const NONE = '__none__';

interface Props {
  /** Trigger id, for a `<Label htmlFor>`. */
  id?: string;
  categories: Category[];
  value: string | undefined;
  onChange: (value: string | undefined) => void;
}

export const CategorySelect = ({ id, categories, value, onChange }: Props): JSX.Element => (
  <Select
    value={value ?? NONE}
    onValueChange={(v) => onChange(v === NONE ? undefined : v)}
  >
    <SelectTrigger id={id}>
      <SelectValue placeholder="Choose a category" />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value={NONE}>No category</SelectItem>
      {categories.map((c) => (
        <SelectItem key={c.id} value={c.id}>
          <span className="inline-flex items-center gap-2">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: categoryColor(c) }}
              aria-hidden
            />
            {c.name}
          </span>
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
);
