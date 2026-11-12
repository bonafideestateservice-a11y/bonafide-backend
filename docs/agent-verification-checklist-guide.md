# Bonafide Agent Field Guide: Verification Checklist Information

This guide outlines the exact information, data fields, media requirements, and sample entries that verification agents must provide when completing assignment checklist items across all verification tiers.

---

## 1. Verification Tiers Overview

Checklist items are dynamically assigned based on the verification package ordered:

* **Basic Package (5 Items):** Physical verification, Court/crime verification, Title deeds & documentation, Valuation verification, Amenities & environment verification.
* **Standard Package (8 Items):** Everything in Basic + Land registry check, Court records search, Local intelligence gathering.
* **Premium Package (10 Items):** Everything in Standard + Property valuation, Feasibility report on intended use.

> **Note:** For properties subscribed to recurring periodic monitoring (e.g., Weekly or Monthly), **Physical verification** will appear as numbered items (`Physical verification 1`, `Physical verification 2`, etc.) corresponding to each scheduled visit in the billing period.

---

## 2. Checklist Section Requirements & Expected Data

### Section 1: Physical Verification
* **Checklist Label:** `Physical verification` (or `Physical verification 1`, `Physical verification 2`)
* **Section Key:** `site_visit` (or `site_visit_1`, `site_visit_2`)
* **Tiers:** Basic, Standard, Premium
* **Media Required:** **Yes** (At least one clear photo or video from the on-site inspection)

| Field Name | Type | Description |
| :--- | :--- | :--- |
| `visitOutcome` | Text | High-level summary of the site visit result (e.g., property located, access confirmed, ongoing construction progress). |
| `notes` | Text | Detailed field observations covering physical boundaries, gate/fencing, structures present, visible occupancy or vacant status, and site condition. |

#### Sample Agent Input:
```json
{
  "visitOutcome": "Property successfully located and physically inspected.",
  "notes": "The property is a 4-bedroom detached duplex with perimeter fencing and a black sliding gate. Premises were occupied by tenants. Structure appears sound with no visible structural cracks. Road access is paved."
}
```

---

### Section 2: Court / Crime Verification
* **Checklist Label:** `Court/crime verification`
* **Section Key:** `court_crime_verification`
* **Tiers:** Basic, Standard, Premium
* **Media Required:** Optional (Attach police reports, court filings, or letters of clearance if sighted)

| Field Name | Type | Description |
| :--- | :--- | :--- |
| `outcome` | Text | Summary of findings regarding active disputes, litigation, police cases, or family ownership disputes. |
| `notes` | Text | Background notes detailing local inquiries with community elders, police desk inquiries, or local jurisdiction registry checks. |

#### Sample Agent Input:
```json
{
  "outcome": "No pending court disputes, injunctions, or criminal complaints found.",
  "notes": "Checked with the local community youth association and customary court bailiff registry. No lis pendens or active litigation exists regarding ownership of Plot 45."
}
```

---

### Section 3: Title Deeds and Documentation Verification
* **Checklist Label:** `Title deeds and documentation verification`
* **Section Key:** `title_deeds_verification`
* **Tiers:** Basic, Standard, Premium
* **Media Required:** **Yes** (Clear photos, scans, or PDF copies of deed of assignment, survey plan, C of O, or purchase receipt)

| Field Name | Type | Description |
| :--- | :--- | :--- |
| `outcome` | Text | High-level conclusion on the authenticity, validity, and chain of title of the presented documents. |
| `notes` | Text | Detailed assessment of seller details, survey beacon numbers, deed registration dates, stamp duty stamps, and any discrepancy between documents and physical property. |

#### Sample Agent Input:
```json
{
  "outcome": "Title documents verified; seller matches registered owner on deed.",
  "notes": "Inspected original Deed of Assignment dated 14th June 2018 and registered Survey Plan No. LA/2018/142. Boundary coordinates on the survey match the physical beacons on-site."
}
```

---

### Section 4: Valuation Verification
* **Checklist Label:** `Valuation verification`
* **Section Key:** `valuation_verification`
* **Tiers:** Basic, Standard, Premium
* **Media Required:** Optional

| Field Name | Type | Description |
| :--- | :--- | :--- |
| `outcome` | Text | General assessment of whether the asking or contract price reflects current market conditions. |
| `notes` | Text | Supporting commentary on prevailing neighborhood land rates, recent adjacent transactions, and price factors (e.g., corner piece, waterlog, proximity to major roads). |

#### Sample Agent Input:
```json
{
  "outcome": "Asking price of ₦85,000,000 is aligned with fair market value in the area.",
  "notes": "Average asking prices for similar 4-bedroom duplexes in this estate range from ₦80,000,000 to ₦90,000,000. Paved access and fully built surroundings justify the current valuation."
}
```

---

### Section 5: Amenities and Environment Verification
* **Checklist Label:** `Amenities and environment verification`
* **Section Key:** `amenities_environment_verification`
* **Tiers:** Basic, Standard, Premium
* **Media Required:** Optional (Street/neighborhood photos can be attached if helpful)

| Field Name | Type | Description |
| :--- | :--- | :--- |
| `outcome` | Text | Overall rating and state of neighborhood infrastructure and utilities. |
| `notes` | Text | Status of electricity (grid/transformer), drainage channels, flooding tendencies, security checkpoints, and proximity to key commercial hubs. |

#### Sample Agent Input:
```json
{
  "outcome": "Neighborhood possesses reliable amenities and adequate infrastructure.",
  "notes": "Paved internal estate roads with functioning concrete gutters. No signs of seasonal waterlogging. Connected to Eko Disco with dedicated estate transformer. 24/7 manned security gate."
}
```

---

### Section 6: Land Registry Check
* **Checklist Label:** `Land registry check`
* **Section Key:** `land_registry_search`
* **Tiers:** Standard, Premium
* **Media Required:** **Yes** (Official search report, letter from registry, or stamped search slip)

| Field Name | Type | Description |
| :--- | :--- | :--- |
| `outcome` | Text | Official registry search result (e.g., title confirmed, mortgaged/encumbered, or no record). |
| `reference` | Text | Official registry search tracking number, volume/page number, or folio reference. |

#### Sample Agent Input:
```json
{
  "outcome": "Certificate of Occupancy confirmed active with no registered liens or bank mortgages.",
  "reference": "Lagos State Lands Registry Search Slip Ref #LSR-2026-9942/Vol 42 Pg 12"
}
```

---

### Section 7: Court Records Search
* **Checklist Label:** `Court records search`
* **Section Key:** `court_records_search`
* **Tiers:** Standard, Premium
* **Media Required:** **Yes** (Official court search slip, search report from lawyer, or certified registry receipt)

| Field Name | Type | Description |
| :--- | :--- | :--- |
| `outcome` | Text | Formal search result across High Court and Magistrate registries for active lawsuits involving the property or seller. |
| `reference` | Text | Search reference, suit search index number, or registry tracking number. |

#### Sample Agent Input:
```json
{
  "outcome": "Search of High Court litigation registry indicates zero pending lawsuits or caveats against the title.",
  "reference": "HC-REG-SEARCH/2026/0883"
}
```

---

### Section 8: Local Intelligence Gathering
* **Checklist Label:** `Local intelligence gathering`
* **Section Key:** `local_intelligence`
* **Tiers:** Standard, Premium
* **Media Required:** **Yes** (Audio recording note, neighborhood photo, or signed interview summary)

| Field Name | Type | Description |
| :--- | :--- | :--- |
| `narrative` | Text | Qualitative insights gathered from adjacent landowners, community heads (Baale/CDA), security guards, or local artisans regarding property history, ownership authenticity, and boundary disputes. |

#### Sample Agent Input:
```json
{
  "narrative": "Interviewed CDA Chairman Mr. Adeleke and the security supervisor of the adjacent street. Confirmed that the current vendor purchased the parcel from the original family in 2018 and constructed the current building without any Omo-Onile interference or rival claims."
}
```

---

### Section 9: Property Valuation
* **Checklist Label:** `Property valuation`
* **Section Key:** `valuation`
* **Tiers:** Premium
* **Media Required:** **Yes** (Formal valuation report, signed valuation certificate, or appraiser worksheet)

| Field Name | Type | Description |
| :--- | :--- | :--- |
| `amount` | Number | Numeric valuation figure (e.g., `85000000`). Must be positive. |
| `currency` | Text | 3-letter ISO 4217 currency code (e.g., `NGN`, `USD`). |
| `basis` | Text | Valuation methodology used (e.g., Direct Market Comparison Approach, Replacement Cost, or Income Capitalization). |
| `comparableEvidence` | Text | Specific recent comparable sales or listed properties in the immediate vicinity used as benchmarks. |

#### Sample Agent Input:
```json
{
  "amount": 85000000,
  "currency": "NGN",
  "basis": "Direct Market Comparison Approach",
  "comparableEvidence": "Plot 38 sold at ₦82,000,000 in August 2026; Plot 52 (similar 4-bed layout) is listed at ₦88,000,000."
}
```

---

### Section 10: Feasibility Report on Property's Intended Use
* **Checklist Label:** `Feasibility report on the property’s intended use`
* **Section Key:** `feasibility`
* **Tiers:** Premium
* **Media Required:** **Yes** (Zoning chart, development feasibility report, or municipal planning confirmation)

| Field Name | Type | Description |
| :--- | :--- | :--- |
| `outcome` | Text | Viability conclusion (e.g., `Feasible without restrictions`, `Feasible with conditions`, or `Unsuitable for intended commercial use`). |
| `assumptions` | Text | Baseline conditions assumed (e.g., obtaining change of use permit, electrical load approval). |
| `constraints` | Text | Zoning restrictions, height limits, setbacks, drainage easements, or traffic constraints. |

#### Sample Agent Input:
```json
{
  "outcome": "Feasible for short-let residential apartments subject to estate CDA approval.",
  "assumptions": "Assumes installation of a private soundproof backup generator and guest parking management plan.",
  "constraints": "Estate covenants prohibit purely commercial walk-in retail; short-stay residential use requires quarterly registration with estate management."
}
```

---

## 3. Checklist Submission API Format

When an agent updates an item via `PATCH /api/v1/admin/verification/agent-assignments/:assignmentId/checklist/:itemId`, the request is sent as `multipart/form-data`:

```http
PATCH /api/v1/admin/verification/agent-assignments/cm1assign001/checklist/cm1item001 HTTP/1.1
Authorization: Bearer <agent_token>
Content-Type: multipart/form-data

status: COMPLETE
result: {"visitOutcome":"Property accessible","notes":"Exterior inspected."}
media: <binary file attachment, e.g. site.jpg>
```

### Completion Criteria:
1. `status` must be `"COMPLETE"`.
2. All required fields for the specific section must have non-empty text (and positive numbers for valuation amounts).
3. If `requiresMedia: true`, at least one file must be attached to the checklist item.
4. When all items are complete, the final PDF report can be submitted via `POST .../report`.

