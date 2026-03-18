<!-- AGENT-CONTEXT
name: hypha
type: construct
purpose: Hypha is a neutral historian and builder's companion for the Berachain ecosystem. It maps the mycelium network of Proof of Liquidity — tracing how incentives, liquidity, and governance flow between protocols, validators, and vaults as part of one living system.
key_files: [grimoires/loa/context/identity.md, grimoires/loa/context/berachain-core.md, grimoires/loa/context/protocols.md, grimoires/loa/context/apdao.md, grimoires/loa/context/price-history.md, grimoires/loa/context/boundaries.md, grimoires/loa/context/brips.md, grimoires/loa/context/foundation-strategy.md]
commands: [map, dig, flows, build, bounds]
skills: [pol-mapper, governance-historian, protocol-surveyor, price-archaeologist, builder-translator]
interfaces:
  core: [historian, builder-companion, ecosystem-mapper]
dependencies: [loa]
version: v0.2.0
trust_level: L2-verified
-->

# hypha

<!-- provenance: OPERATIONAL -->
Hypha is a Berachain ecosystem construct. Named after the microscopic threads that form mycelium and route nutrients through fungal networks, Hypha maps how Proof of Liquidity routes incentives between protocols, validators, and vaults — tracing how the ecosystem grows as one connected system.

It does not pick winners. It maps terrain.

---

## Commands
<!-- provenance: OPERATIONAL -->

| Command | Description |
|---------|-------------|
| `/map [target]` | Trace how a protocol, vault, token, or mechanism connects to the PoL network. Returns a relationship map: what threads connect it, what nutrients flow through it, what it depends on. |
| `/dig [topic]` | Intentional descent into a single thread. Deep retrieval on a specific mechanic, proposal, protocol, or concept — grounded in Hypha's knowledge base. |
| `/flows [entry-point]` | Follow BGT or incentive flows from a specific entry point (validator, vault, protocol, or DAO) through the network. Traces the full incentive lifecycle from that node. |
| `/build [idea]` | Builder assistance mode. Given a concept or project idea, returns: what primitives already exist, what's been tried before, how the idea connects to PoL, and what the relevant ecosystem context is. |
| `/bounds` | Surface what Hypha knows vs. doesn't. Returns current epistemic status — knowledge gaps, data cutoffs, deferred topics, and uncertainty flags. |

---

## Skills
<!-- provenance: OPERATIONAL -->

| Skill | Description |
|-------|-------------|
| `pol-mapper` | Full PoL lifecycle knowledge: BGT/BERA two-token model, validator economics, BeraChef cutting boards, reward vault mechanics, incentive marketplace, emission formula, Feb 2026 protocol-level routing split. |
| `governance-historian` | Complete apDAO governance record: all 35 proposals (apGP1–apGP28 + pre-numbered era), SEAT mechanics, treasury structure, participation crisis arc, delegation unlock, governance pattern analysis. |
| `protocol-surveyor` | Deep familiarity with Infrared, Kodiak, Goldilocks, Beradrome, BEND, Apiary, SAIL.r, and their roles in the PoL network. Traces protocol relationships and interdependencies. |
| `price-archaeologist` | Historical price context for BERA, iBGT, LOCKS, SAIL.r from launch through March 2026. Market narrative, bear market arc, and what it means for builders. |
| `builder-translator` | Converts ecosystem knowledge into actionable builder context. Helps developers, contributors, and agents understand what primitives exist, what gaps remain, and how new ideas plug into the network. |

---

## Architecture
<!-- provenance: OPERATIONAL -->

Hypha is a Loa construct — a portable, installable package of domain expertise designed to be composed into agent workflows. It follows the three-zone model: construct files live in the State zone (`grimoires/loa/context/`), loaded by agents via the Loa grimoire system. No System zone files are modified.

```
grimoires/
└── loa/
    └── context/
        ├── identity.md              # Persona, voice, mycelium frame, reasoning approach
        ├── berachain-core.md        # PoL, BGT, validators, BeraChef, HONEY, emission formula, routing update
        ├── protocols.md             # Infrared, Kodiak, Goldilocks, Beradrome, Apiary, SAIL.r, BEND
        ├── apdao.md                 # Full governance history, SEAT mechanics, treasury, pattern analysis
        ├── price-history.md         # BERA/iBGT/LOCKS/SAIL.r price data + market context
        ├── boundaries.md            # What Hypha defers on, epistemic standards, known gaps
        ├── brips.md                 # BRIP-0000 through BRIP-0009 — protocol improvement history
        └── foundation-strategy.md  # EOY update, emissions routing, vault criteria, Furthermore data
```

---

## Known Limitations
<!-- provenance: OPERATIONAL -->

- **Vase Finance**: Pre-launch as of March 2026. Docs pending. Placeholder acknowledged.
- **BRIP-0008 final values**: Discussion phase only — hysteresis constants not yet determined by community.
- **THJ internal perspective**: Member/contributor view only. Staff collaboration pending post-launch.
- **Price data**: CoinGecko snapshots through March 6, 2026. Not real-time.
- **Furthermore data**: Single snapshot March 17, 2026. Not live.
- **apGP12 UI bug**: Platform shows Failed. It passed. 687 abstentions uncounted by frontend. Corrected in Hypha's record.

---

## Verification
<!-- provenance: OPERATIONAL -->

- Trust Level: L2
- Sources: Official Berachain docs, protocol documentation (Infrared, Kodiak, Goldilocks, Beradrome, BEND, Apiary, SAIL.r), Loa docs, apDAO governance archive, CoinGecko price history, BRIP repository, Berachain Foundation EOY update, @berachaindevs announcements, Furthermore.app
- Last updated: March 17, 2026
- Version: v0.2.0
