import { z } from "zod";

const openF1SessionSchema = z.object({
  session_key: z.number().int(),
  session_type: z.string(),
  session_name: z.string(),
  date_start: z.string().datetime({ offset: true }),
  date_end: z.string().datetime({ offset: true }),
  meeting_key: z.number().int(),
  circuit_short_name: z.string().nullable().optional(),
  country_name: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  year: z.number().int(),
});

const openF1DriverSchema = z.object({
  meeting_key: z.number().int(),
  session_key: z.number().int().optional(),
  driver_number: z.number().int(),
  broadcast_name: z.string().nullable().optional(),
  full_name: z.string().nullable().optional(),
  name_acronym: z.string().nullable().optional(),
  team_name: z.string().nullable().optional(),
  team_colour: z.string().nullable().optional(),
  headshot_url: z.string().nullable().optional(),
});

const openF1PositionSchema = z.object({
  date: z.string().datetime({ offset: true }),
  session_key: z.number().int(),
  meeting_key: z.number().int(),
  driver_number: z.number().int(),
  position: z.number().int(),
});

const openF1LocationSchema = z.object({
  date: z.string().datetime({ offset: true }),
  session_key: z.number().int(),
  meeting_key: z.number().int(),
  driver_number: z.number().int(),
  x: z.number().int(),
  y: z.number().int(),
  z: z.number().int(),
});

const openF1IntervalValueSchema = z.union([z.number(), z.string()]).nullable();

const openF1IntervalSchema = z.object({
  date: z.string().datetime({ offset: true }),
  session_key: z.number().int(),
  meeting_key: z.number().int(),
  driver_number: z.number().int(),
  interval: openF1IntervalValueSchema.optional(),
  gap_to_leader: openF1IntervalValueSchema.optional(),
});

const openF1LapSchema = z.object({
  meeting_key: z.number().int(),
  session_key: z.number().int(),
  driver_number: z.number().int(),
  lap_number: z.number().int(),
  date_start: z.string().datetime({ offset: true }).nullable().optional(),
  duration_sector_1: z.number().nullable().optional(),
  duration_sector_2: z.number().nullable().optional(),
  duration_sector_3: z.number().nullable().optional(),
  i1_speed: z.number().int().nullable().optional(),
  i2_speed: z.number().int().nullable().optional(),
  is_pit_out_lap: z.boolean().nullable().optional(),
  lap_duration: z.number().nullable().optional(),
  st_speed: z.number().int().nullable().optional(),
});

const openF1StintSchema = z.object({
  meeting_key: z.number().int(),
  session_key: z.number().int(),
  stint_number: z.number().int(),
  driver_number: z.number().int(),
  lap_start: z.number().int().nullable().optional(),
  lap_end: z.number().int().nullable().optional(),
  compound: z.string().nullable().optional(),
  tyre_age_at_start: z.number().int().nullable().optional(),
});

const openF1WeatherSchema = z.object({
  date: z.string().datetime({ offset: true }),
  session_key: z.number().int(),
  meeting_key: z.number().int(),
  humidity: z.number().nullable().optional(),
  wind_speed: z.number().nullable().optional(),
  air_temperature: z.number().nullable().optional(),
  rainfall: z.number().nullable().optional(),
  track_temperature: z.number().nullable().optional(),
  pressure: z.number().nullable().optional(),
  wind_direction: z.number().nullable().optional(),
});

const openF1CarDataSchema = z.object({
  date: z.string().datetime({ offset: true }),
  session_key: z.number().int(),
  meeting_key: z.number().int(),
  driver_number: z.number().int(),
  brake: z.number().int().nullable().optional(),
  speed: z.number().int().nullable().optional(),
  n_gear: z.number().int().nullable().optional(),
  rpm: z.number().int().nullable().optional(),
  throttle: z.number().int().nullable().optional(),
  drs: z.number().nullable().optional(),
});

export type OpenF1Session = z.infer<typeof openF1SessionSchema>;
export type OpenF1Driver = z.infer<typeof openF1DriverSchema>;
export type OpenF1Position = z.infer<typeof openF1PositionSchema>;
export type OpenF1Location = z.infer<typeof openF1LocationSchema>;
export type OpenF1Interval = z.infer<typeof openF1IntervalSchema>;
export type OpenF1Lap = z.infer<typeof openF1LapSchema>;
export type OpenF1Stint = z.infer<typeof openF1StintSchema>;
export type OpenF1Weather = z.infer<typeof openF1WeatherSchema>;
export type OpenF1CarData = z.infer<typeof openF1CarDataSchema>;

function driverRecordCompleteness(driver: OpenF1Driver) {
  return [
    driver.session_key,
    driver.broadcast_name,
    driver.full_name,
    driver.name_acronym,
    driver.team_name,
    driver.team_colour,
    driver.headshot_url,
  ].filter((value) => value != null && value !== "").length;
}

function dedupeDrivers(drivers: OpenF1Driver[]) {
  const uniqueDrivers = new Map<number, OpenF1Driver>();

  for (const driver of drivers) {
    const current = uniqueDrivers.get(driver.driver_number);

    if (
      !current ||
      driverRecordCompleteness(driver) > driverRecordCompleteness(current)
    ) {
      uniqueDrivers.set(driver.driver_number, driver);
    }
  }

  return [...uniqueDrivers.values()].sort(
    (left, right) => left.driver_number - right.driver_number,
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getRetryDelayMs(response: Response, attempt: number) {
  const retryAfter = response.headers.get("retry-after");

  if (retryAfter) {
    const seconds = Number.parseFloat(retryAfter);

    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.ceil(seconds * 1000);
    }
  }

  // OpenF1 does not always return a rate-limit header. Keep the importer
  // conservative and increase wait time on repeated throttling.
  return Math.min(2000 * 2 ** attempt, 20000);
}

export class OpenF1Client {
  private readonly minRequestIntervalMs = 350;
  private nextRequestAt = 0;
  private requestQueue = Promise.resolve();

  constructor(
    private readonly baseUrl = "https://api.openf1.org/v1",
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async getSessions(year: number): Promise<OpenF1Session[]> {
    return this.fetchCollection(
      "/v1/sessions",
      { year: String(year) },
      z.array(openF1SessionSchema),
      "sessions",
    );
  }

  async getMeetingDriverCount(meetingKey: number): Promise<number> {
    const drivers = await this.fetchCollection(
      "/v1/drivers",
      { meeting_key: String(meetingKey) },
      z.array(openF1DriverSchema),
      "drivers",
    );
    return new Set(drivers.map((driver) => driver.driver_number)).size;
  }

  async getSessionByKey(sessionKey: number) {
    const sessions = await this.fetchCollection(
      "/v1/sessions",
      { session_key: String(sessionKey) },
      z.array(openF1SessionSchema),
      "sessions",
    );

    return sessions[0];
  }

  getSessionDrivers(sessionKey: number): Promise<OpenF1Driver[]> {
    return this.fetchCollection(
      "/v1/drivers",
      { session_key: String(sessionKey) },
      z.array(openF1DriverSchema),
      "drivers",
    ).then(dedupeDrivers);
  }

  getSessionPositions(sessionKey: number, driverNumber: number) {
    return this.fetchCollection(
      "/v1/position",
      {
        session_key: String(sessionKey),
        driver_number: String(driverNumber),
      },
      z.array(openF1PositionSchema),
      "position",
      { allowNotFound: true },
    );
  }

  getSessionLocations(sessionKey: number, driverNumber: number) {
    return this.fetchCollection(
      "/v1/location",
      {
        session_key: String(sessionKey),
        driver_number: String(driverNumber),
      },
      z.array(openF1LocationSchema),
      "location",
    );
  }

  getSessionIntervals(sessionKey: number, driverNumber?: number) {
    const params: Record<string, string> = {
      session_key: String(sessionKey),
    };

    if (driverNumber !== undefined) {
      params.driver_number = String(driverNumber);
    }

    return this.fetchCollection(
      "/v1/intervals",
      params,
      z.array(openF1IntervalSchema),
      "intervals",
      { allowNotFound: true },
    );
  }

  getSessionLaps(sessionKey: number, driverNumber?: number) {
    const params: Record<string, string> = {
      session_key: String(sessionKey),
    };

    if (driverNumber !== undefined) {
      params.driver_number = String(driverNumber);
    }

    return this.fetchCollection(
      "/v1/laps",
      params,
      z.array(openF1LapSchema),
      "laps",
      { allowNotFound: true },
    );
  }

  getSessionStints(sessionKey: number, driverNumber?: number) {
    const params: Record<string, string> = {
      session_key: String(sessionKey),
    };

    if (driverNumber !== undefined) {
      params.driver_number = String(driverNumber);
    }

    return this.fetchCollection(
      "/v1/stints",
      params,
      z.array(openF1StintSchema),
      "stints",
      { allowNotFound: true },
    );
  }

  getSessionWeather(sessionKey: number) {
    return this.fetchCollection(
      "/v1/weather",
      { session_key: String(sessionKey) },
      z.array(openF1WeatherSchema),
      "weather",
      { allowNotFound: true },
    );
  }

  getSessionCarData(sessionKey: number, driverNumber?: number) {
    const params: Record<string, string> = {
      session_key: String(sessionKey),
    };

    if (driverNumber !== undefined) {
      params.driver_number = String(driverNumber);
    }

    return this.fetchCollection(
      "/v1/car_data",
      params,
      z.array(openF1CarDataSchema),
      "car_data",
      { allowNotFound: true },
    );
  }

  async getCurrentSession(now = new Date()) {
    const sessions = await this.getSessions(now.getUTCFullYear());

    const withTimes = sessions.map((session) => ({
      session,
      start: new Date(session.date_start),
      end: new Date(session.date_end),
    }));

    const liveSession = withTimes.find(
      ({ start, end }) => now >= start && now <= end,
    );

    if (liveSession) {
      return liveSession.session;
    }

    const latestStarted = [...withTimes]
      .filter(({ start }) => now >= start)
      .sort((left, right) => right.start.getTime() - left.start.getTime())[0];

    if (latestStarted) {
      return latestStarted.session;
    }

    return withTimes.sort(
      (left, right) => left.start.getTime() - right.start.getTime(),
    )[0]?.session;
  }

  private async fetchCollection<T>(
    path: string,
    params: Record<string, string>,
    schema: z.ZodType<T>,
    label: string,
    options?: {
      allowNotFound?: boolean;
    },
  ): Promise<T> {
    const url = new URL(path, this.baseUrl);

    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    for (let attempt = 0; attempt < 6; attempt += 1) {
      const response = await this.scheduleRequest(() =>
        this.fetchImpl(url.toString(), {
          headers: {
            Accept: "application/json",
          },
          cache: "no-store",
        }),
      );

      if (response.ok) {
        return schema.parse(await response.json());
      }

      if (response.status === 404 && options?.allowNotFound) {
        return schema.parse([]);
      }

      if (response.status === 429 && attempt < 5) {
        await sleep(getRetryDelayMs(response, attempt));
        continue;
      }

      throw new Error(`OpenF1 ${label} request failed: ${response.status}`);
    }

    throw new Error(`OpenF1 ${label} request exhausted retries.`);
  }

  private async scheduleRequest<T>(task: () => Promise<T>) {
    let releaseCurrentSlot!: () => void;
    const previousSlot = this.requestQueue;

    this.requestQueue = new Promise<void>((resolve) => {
      releaseCurrentSlot = resolve;
    });

    await previousSlot;

    const waitMs = Math.max(0, this.nextRequestAt - Date.now());

    if (waitMs > 0) {
      await sleep(waitMs);
    }

    this.nextRequestAt = Date.now() + this.minRequestIntervalMs;
    releaseCurrentSlot();

    return task();
  }
}

export function deriveSessionStatus(
  dateStart: string,
  dateEnd: string,
  now = new Date(),
) {
  const start = new Date(dateStart);
  const end = new Date(dateEnd);

  if (now < start) {
    return "scheduled";
  }

  if (now >= start && now <= end) {
    return "live";
  }

  return "completed";
}

export function deriveMeetingName(session: OpenF1Session) {
  if (session.country_name) {
    return `${session.country_name} Grand Prix`;
  }

  if (session.location) {
    return `${session.location} Grand Prix`;
  }

  return session.circuit_short_name ?? `Meeting ${session.meeting_key}`;
}
