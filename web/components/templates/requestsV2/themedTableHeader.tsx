import { FunnelIcon, ViewColumnsIcon } from "@heroicons/react/24/outline";
import { Column } from "@tanstack/react-table";
import { Dispatch, SetStateAction, useEffect, useState } from "react";
import { DateRange } from "react-day-picker";
import { Result } from "../../../lib/result";
import { TimeInterval } from "../../../lib/timeCalculations/time";
import { SingleFilterDef } from "../../../services/lib/filters/frontendFilterDefs";
import { clsx } from "../../shared/clsx";
import {
  AdvancedFilters,
  UIFilterRow,
} from "../../shared/themed/themedAdvancedFilters";
import { ThemedPill } from "../../shared/themed/themedPill";
import ThemedTimeFilter from "../../shared/themed/themedTimeFilter";
import DatePicker from "./datePicker";
import ExportButton from "./exportButton";
import ViewColumns from "./viewColumns";

interface ThemedTableHeaderProps<T> {
  columns: Column<T, unknown>[];
  rows: T[];
  onSelectAll: (value?: boolean | undefined) => void;
  visibleColumns: number;
  onTimeSelectHandler: (key: TimeInterval, value: string) => void;
  // TODO: rewrite these filters
  filterMap: SingleFilterDef<any>[];
  filters: UIFilterRow[];
  setAdvancedFilters: Dispatch<SetStateAction<UIFilterRow[]>>;
  searchPropertyFilters: (
    property: string,
    search: string
  ) => Promise<Result<void, string>>;
}

export default function ThemedTableHeader<T>(props: ThemedTableHeaderProps<T>) {
  const {
    columns,
    onSelectAll,
    visibleColumns,
    rows,
    onTimeSelectHandler,
    filterMap,
    filters,
    setAdvancedFilters,
    searchPropertyFilters,
  } = props;

  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    const displayFilters = window.localStorage.getItem("showFilters") || null;
    setShowFilters(displayFilters ? JSON.parse(displayFilters) : false);
  }, []);

  // TODO: fix this. this is dank
  const showFilterHandler = () => {
    setShowFilters(!showFilters);
    window.localStorage.setItem("showFilters", JSON.stringify(!showFilters));
  };

  return (
    <div className="flex flex-col space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row justify-between ">
        <ThemedTimeFilter
          timeFilterOptions={[
            { key: "24h", value: "24H" },
            { key: "7d", value: "7D" },
            { key: "1m", value: "1M" },
            { key: "3m", value: "3M" },
            { key: "all", value: "All" },
          ]}
          onSelect={function (key: string, value: string): void {
            onTimeSelectHandler(key as TimeInterval, value);
          }}
          isFetching={false}
          defaultValue={"24h"}
          custom={true}
        />
        {/* <DatePicker currentRange={currentRange} onTimeFilter={onTimeFilter} /> */}
        <div className="flex flex-row gap-2">
          <button
            onClick={showFilterHandler}
            className={clsx(
              "bg-white border border-gray-300 rounded-lg px-2.5 py-1.5 hover:bg-sky-50 flex flex-row items-center gap-2"
            )}
          >
            <FunnelIcon className="h-5 w-5 text-gray-900" />
            <p className="text-sm font-medium text-gray-900 hidden sm:block">
              {showFilters ? "Hide" : "Show"} Filters
            </p>
          </button>
          <ViewColumns
            columns={columns}
            onSelectAll={onSelectAll}
            visibleColumns={visibleColumns}
          />
          <ExportButton rows={rows} />
        </div>
      </div>
      {showFilters && (
        <AdvancedFilters
          filterMap={filterMap}
          filters={filters}
          setAdvancedFilters={setAdvancedFilters}
          searchPropertyFilters={searchPropertyFilters}
        />
      )}
      {filters.length > 0 && !showFilters && (
        <div className="flex-wrap w-full flex-row space-x-4 space-y-2 mt-4">
          {filters.map((_filter, index) => {
            return (
              <ThemedPill
                key={index}
                label={`${filterMap[_filter.filterMapIdx]?.label} ${
                  filterMap[_filter.filterMapIdx]?.operators[
                    _filter.operatorIdx
                  ].label
                } ${_filter.value}`}
                onDelete={() => {
                  setAdvancedFilters((prev) => {
                    const newFilters = [...prev];
                    newFilters.splice(index, 1);
                    return newFilters;
                  });
                }}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
