"use client";

import { useEffect, useRef, useState } from "react";
import { TextField } from "@/components/admin/field";
import { CascadingPlace } from "@/components/admin/cascading-place";
import {
  lookupPostalCode,
  type PostalCodeLookupHit,
} from "@/lib/actions/postal-code-lookup";

type LookupStatus = "idle" | "looking" | "found" | "new";

type LocationFieldErrors = {
  zipcode?: string[];
  locationCity?: string[];
  locationState?: string[];
  locationCountry?: string[];
};

export function LocationFields({
  initialZipcode = "",
  initialCity = "",
  initialState = "",
  initialCountry = "",
  initialPostalCodeId = null,
  fieldErrors,
}: {
  initialZipcode?: string;
  initialCity?: string;
  initialState?: string;
  initialCountry?: string;
  initialPostalCodeId?: string | null;
  fieldErrors?: LocationFieldErrors;
}) {
  const [zipcode, setZipcode] = useState(initialZipcode);
  const [foundCity, setFoundCity] = useState(initialCity);
  const [foundState, setFoundState] = useState(initialState);
  const [foundCountry, setFoundCountry] = useState(initialCountry);
  const [status, setStatus] = useState<LookupStatus>(
    initialPostalCodeId ? "found" : initialZipcode ? "new" : "idle",
  );

  const lookupSeq = useRef(0);

  useEffect(() => {
    const trimmed = zipcode.trim();
    if (trimmed.length === 0) {
      setStatus("idle");
      setFoundCity("");
      setFoundState("");
      setFoundCountry("");
      return;
    }
    if (
      trimmed === initialZipcode.trim() &&
      status === "found" &&
      initialPostalCodeId
    ) {
      return;
    }

    const seq = ++lookupSeq.current;
    setStatus("looking");
    const handle = setTimeout(async () => {
      let hit: PostalCodeLookupHit | null = null;
      try {
        hit = await lookupPostalCode(trimmed);
      } catch {
        hit = null;
      }
      if (seq !== lookupSeq.current) return;
      if (hit) {
        setFoundCity(hit.city);
        setFoundState(hit.state);
        setFoundCountry(hit.country);
        setStatus("found");
      } else {
        setFoundCity("");
        setFoundState("");
        setFoundCountry("");
        setStatus("new");
      }
    }, 300);

    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zipcode]);

  const caption =
    status === "found"
      ? "Auto-filled from postal-code master."
      : status === "new"
        ? "Enter zipcode and country to auto-fill state and city; the master row is created on save."
        : status === "looking"
          ? "Looking up…"
          : "Enter a zipcode above to auto-fill location.";

  return (
    <fieldset className="grid grid-cols-1 gap-3 rounded-md border border-border/60 p-3 md:grid-cols-4">
      <legend className="px-1 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
        Location
      </legend>
      <TextField
        label="Zipcode"
        name="zipcode"
        value={zipcode}
        onChange={(e) => setZipcode(e.target.value)}
        errors={fieldErrors?.zipcode}
        placeholder="94016"
        hint={status === "looking" ? "Looking up…" : undefined}
      />
      {status === "found" ? (
        <>
          <TextField
            label="City"
            name="locationCity"
            value={foundCity}
            readOnly
            onChange={() => undefined}
            errors={fieldErrors?.locationCity}
          />
          <TextField
            label="State"
            name="locationState"
            value={foundState}
            readOnly
            onChange={() => undefined}
            errors={fieldErrors?.locationState}
          />
          <TextField
            label="Country"
            name="locationCountry"
            value={foundCountry}
            readOnly
            onChange={() => undefined}
            errors={fieldErrors?.locationCountry}
          />
        </>
      ) : status === "new" ? (
        <CascadingPlace
          zip={zipcode}
          fieldNames={{
            country: "locationCountry",
            state: "locationState",
            city: "locationCity",
          }}
          errors={{
            country: fieldErrors?.locationCountry,
            state: fieldErrors?.locationState,
            city: fieldErrors?.locationCity,
          }}
        />
      ) : (
        <>
          <TextField
            label="City"
            name="locationCity"
            value=""
            readOnly
            onChange={() => undefined}
          />
          <TextField
            label="State"
            name="locationState"
            value=""
            readOnly
            onChange={() => undefined}
          />
          <TextField
            label="Country"
            name="locationCountry"
            value=""
            readOnly
            onChange={() => undefined}
          />
        </>
      )}
      <p className="text-xs text-fg-subtle md:col-span-4">{caption}</p>
    </fieldset>
  );
}
