import { MESI, YEAR_MAX, YEAR_MIN } from "../../config/constants";
import { parseMk, mkOf } from "../../utils/helpers";
import { Select } from "../Forms";

export function MonthYearSelect({ value, onChange }) {
  const { y, m } = parseMk(value);
  return (
    <div className="flex gap-1.5">
      <Select value={m} onChange={(e) => onChange(mkOf(y, Number(e.target.value)))} className="!w-auto">{MESI.map((l, i) => <option key={i} value={i}>{l}</option>)}</Select>
      <Select value={y} onChange={(e) => onChange(mkOf(Number(e.target.value), m))} className="!w-auto">{Array.from({ length: YEAR_MAX - YEAR_MIN + 1 }, (_, i) => YEAR_MIN + i).map((yy) => <option key={yy} value={yy}>{yy}</option>)}</Select>
    </div>
  );
}