import { SupabaseClient, User } from "@supabase/supabase-js";
import { FilterNode } from "../../../services/lib/filters/filterDefs";
import {
  buildFilterWithAuth,
  buildFilterWithAuthClickHouse,
} from "../../../services/lib/filters/filters";

import { Result } from "../../result";
import {
  isValidTimeFilter,
  isValidTimeIncrement,
  isValidTimeZoneDifference,
} from "../../sql/timeHelpers";
import { TimeIncrement } from "../../timeCalculations/fetchTimeData";
import { dbExecute, dbQueryClickhouse } from "../db/dbExecute";

import { DataOverTimeRequest } from "./timeDataHandlerWrapper";

export interface GetTimeDataOptions {
  filter: FilterNode;
  dbIncrement: TimeIncrement;
}

export interface AuthClient {
  client: SupabaseClient;
  user: User;
}

export interface DateCountDBModel {
  created_at_trunc: Date;
  count: number;
}

export async function getTotalRequestsOverTime({
  timeFilter,
  userFilter,
  orgId,
  dbIncrement,
  timeZoneDifference,
}: DataOverTimeRequest): Promise<Result<DateCountDBModel[], string>> {
  const timeFilterNode: FilterNode = {
    left: {
      response_copy_v2: {
        request_created_at: {
          gte: new Date(timeFilter.start),
        },
      },
    },
    right: {
      response_copy_v2: {
        request_created_at: {
          lte: new Date(timeFilter.end),
        },
      },
    },
    operator: "and",
  };
  const filter: FilterNode = {
    left: timeFilterNode,
    right: userFilter,
    operator: "and",
  };
  if (!isValidTimeFilter(timeFilter)) {
    return { data: null, error: "Invalid time filter" };
  }
  if (!isValidTimeIncrement(dbIncrement)) {
    return { data: null, error: "Invalid time increment" };
  }
  if (!isValidTimeZoneDifference(timeZoneDifference)) {
    return { data: null, error: "Invalid time zone difference" };
  }
  const builtFilter = await buildFilterWithAuthClickHouse({
    org_id: orgId,
    filter,
    argsAcc: [],
  });
  const dateTrunc = `DATE_TRUNC('${dbIncrement}', request_created_at + INTERVAL '${timeZoneDifference} minute')`;
  const query = `
SELECT
  ${dateTrunc} as created_at_trunc,
  count(*) as count
FROM response_copy_v2
WHERE (
  ${builtFilter.filter}
)
GROUP BY ${dateTrunc}
`;

  const { data, error } = await dbQueryClickhouse<DateCountDBModel>(
    query,
    builtFilter.argsAcc
  );
  if (error !== null) {
    console.error("Error getting total requests over time", error);
    return { data: null, error: error };
  }
  return {
    data: data.map((d) => ({
      created_at_trunc: new Date(
        new Date(d.created_at_trunc).getTime() - timeZoneDifference * 60 * 1000
      ),
      count: Number(d.count),
    })),
    error: null,
  };
}
