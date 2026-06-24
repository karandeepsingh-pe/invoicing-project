"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Country, State, City, type ICountry, type IState } from "country-state-city";
import { geocodeZip, type GeocodeZipHit } from "@/lib/actions/geocode-zip";

type FieldNames = {
  country: string;
  state: string;
  city: string;
};

type Errors = {
  country?: string[];
  state?: string[];
  city?: string[];
};

type GeoStatus = "idle" | "looking" | "ok" | "failed";

const COUNTRY_ALIASES: Record<string, string> = {
  USA: "United States",
  "U.S.A.": "United States",
  "U.S.": "United States",
  US: "United States",
  UK: "United Kingdom",
  "U.K.": "United Kingdom",
  UAE: "United Arab Emirates",
};

function resolveCountryByName(name: string, all: ICountry[]): ICountry | null {
  if (!name) return null;
  const lowered = name.trim().toLowerCase();
  const exact = all.find((c) => c.name.toLowerCase() === lowered);
  if (exact) return exact;
  const aliased = COUNTRY_ALIASES[name.trim().toUpperCase()];
  if (aliased) return all.find((c) => c.name === aliased) ?? null;
  return null;
}

function resolveStateByName(name: string, states: IState[]): IState | null {
  if (!name) return null;
  const lowered = name.trim().toLowerCase();
  return (
    states.find((s) => s.name.toLowerCase() === lowered) ??
    states.find((s) => s.isoCode.toLowerCase() === lowered) ??
    null
  );
}

const inputClass =
  "glass-input rounded-md px-3 py-2 text-sm text-fg placeholder:text-fg-subtle transition-colors";

function Spinner() {
  return (
    <span
      className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-fg-subtle border-t-transparent align-middle"
      aria-label="Looking up location"
    />
  );
}

export function CascadingPlace({
  fieldNames,
  initialCountry = "",
  initialState = "",
  initialCity = "",
  zip = "",
  errors,
  labels = { country: "Country", state: "State", city: "City" },
  required = false,
}: {
  fieldNames: FieldNames;
  initialCountry?: string;
  initialState?: string;
  initialCity?: string;
  /** When set with a country, a zip lookup (Zippopotam) auto-fills state + city. */
  zip?: string;
  errors?: Errors;
  labels?: { country: string; state: string; city: string };
  required?: boolean;
}) {
  const countries = useMemo(() => Country.getAllCountries(), []);

  const initialCountryRow = useMemo(
    () => resolveCountryByName(initialCountry, countries),
    [countries, initialCountry],
  );
  const [countryIso, setCountryIso] = useState<string>(initialCountryRow?.isoCode ?? "");

  const states = useMemo(
    () => (countryIso ? State.getStatesOfCountry(countryIso) : []),
    [countryIso],
  );
  const initialStateRow = useMemo(
    () => (initialCountryRow ? resolveStateByName(initialState, states) : null),
    [initialCountryRow, initialState, states],
  );
  const [stateIso, setStateIso] = useState<string>(initialStateRow?.isoCode ?? "");

  const cities = useMemo(
    () => (countryIso && stateIso ? City.getCitiesOfState(countryIso, stateIso) : []),
    [countryIso, stateIso],
  );
  const initialCityValid = useMemo(
    () =>
      cities.some((c) => c.name.toLowerCase() === initialCity.trim().toLowerCase())
        ? initialCity
        : "",
    [cities, initialCity],
  );
  const [cityName, setCityName] = useState<string>(initialCityValid);

  // A city detected by zip lookup that country-state-city doesn't know — kept as
  // a selectable option so it can still be submitted (the master stores free-text).
  const [extraCity, setExtraCity] = useState("");
  const [geoStatus, setGeoStatus] = useState<GeoStatus>("idle");

  const selectedCountry = countries.find((c) => c.isoCode === countryIso) ?? null;
  const selectedState = states.find((s) => s.isoCode === stateIso) ?? null;

  // Read the latest state/city inside the (country, zip)-keyed effect without
  // adding them as deps — we only auto-fill blank fields, never clobber a pick.
  const geoSeq = useRef(0);
  const stateIsoRef = useRef(stateIso);
  stateIsoRef.current = stateIso;
  const cityNameRef = useRef(cityName);
  cityNameRef.current = cityName;

  useEffect(() => {
    const z = zip.trim();
    if (!countryIso || z.length < 4) {
      setGeoStatus("idle");
      return;
    }
    const seq = ++geoSeq.current;
    setGeoStatus("looking");
    const handle = setTimeout(async () => {
      let hit: GeocodeZipHit | null = null;
      try {
        hit = await geocodeZip(countryIso, z);
      } catch {
        hit = null;
      }
      if (seq !== geoSeq.current) return;
      if (!hit) {
        setGeoStatus("failed");
        return;
      }
      const found = hit;
      const countryStates = State.getStatesOfCountry(countryIso);
      const matched =
        (found.stateAbbr
          ? countryStates.find(
              (s) => s.isoCode.toLowerCase() === found.stateAbbr.toLowerCase(),
            )
          : undefined) ??
        (found.stateName
          ? countryStates.find(
              (s) => s.name.toLowerCase() === found.stateName.toLowerCase(),
            )
          : undefined) ??
        null;
      if (!matched) {
        setGeoStatus("failed");
        return;
      }
      if (stateIsoRef.current === "") setStateIso(matched.isoCode);
      if (found.city && cityNameRef.current === "") {
        const known = City.getCitiesOfState(countryIso, matched.isoCode).some(
          (c) => c.name.toLowerCase() === found.city.toLowerCase(),
        );
        setExtraCity(known ? "" : found.city);
        setCityName(found.city);
      }
      setGeoStatus("ok");
    }, 400);

    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countryIso, zip]);

  function handleCountryChange(e: ChangeEvent<HTMLSelectElement>) {
    setCountryIso(e.target.value);
    setStateIso("");
    setCityName("");
    setExtraCity("");
  }

  function handleStateChange(e: ChangeEvent<HTMLSelectElement>) {
    setStateIso(e.target.value);
    setCityName("");
    setExtraCity("");
  }

  function handleCityChange(e: ChangeEvent<HTMLSelectElement>) {
    setCityName(e.target.value);
  }

  const showExtraCity =
    extraCity.length > 0 &&
    !cities.some((c) => c.name.toLowerCase() === extraCity.toLowerCase());

  return (
    <>
      <input type="hidden" name={fieldNames.country} value={selectedCountry?.name ?? ""} />
      <input type="hidden" name={fieldNames.state} value={selectedState?.name ?? ""} />
      <input type="hidden" name={fieldNames.city} value={cityName} />

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-fg-muted">{labels.country}</span>
        <select
          className={inputClass}
          value={countryIso}
          onChange={handleCountryChange}
          required={required}
        >
          <option value="">Select country…</option>
          {countries.map((c) => (
            <option key={c.isoCode} value={c.isoCode}>
              {c.name}
            </option>
          ))}
        </select>
        {errors?.country?.map((e) => (
          <span key={e} className="text-xs text-danger">
            {e}
          </span>
        ))}
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="flex items-center gap-1.5 text-xs font-medium text-fg-muted">
          {labels.state}
          {geoStatus === "looking" && <Spinner />}
        </span>
        <select
          className={inputClass}
          value={stateIso}
          onChange={handleStateChange}
          disabled={!countryIso || states.length === 0}
          required={required}
        >
          <option value="">
            {!countryIso
              ? "Pick country first"
              : states.length === 0
                ? "No states available"
                : "Select state…"}
          </option>
          {states.map((s) => (
            <option key={s.isoCode} value={s.isoCode}>
              {s.name}
            </option>
          ))}
        </select>
        {errors?.state?.map((e) => (
          <span key={e} className="text-xs text-danger">
            {e}
          </span>
        ))}
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="flex items-center gap-1.5 text-xs font-medium text-fg-muted">
          {labels.city}
          {geoStatus === "looking" && <Spinner />}
        </span>
        <select
          className={inputClass}
          value={cityName}
          onChange={handleCityChange}
          disabled={!stateIso || (cities.length === 0 && !showExtraCity)}
          required={required}
        >
          <option value="">
            {!stateIso
              ? "Pick state first"
              : cities.length === 0 && !showExtraCity
                ? "No cities available"
                : "Select city…"}
          </option>
          {showExtraCity && <option value={extraCity}>{extraCity}</option>}
          {cities.map((c) => (
            <option key={`${c.name}-${c.stateCode}`} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>
        {errors?.city?.map((e) => (
          <span key={e} className="text-xs text-danger">
            {e}
          </span>
        ))}
      </label>

      {geoStatus === "failed" && (
        <p className="text-xs text-warning md:col-span-4">
          Couldn&rsquo;t auto-detect location — please select manually.
        </p>
      )}
    </>
  );
}
