---
title: <short name>
type: feature            # feature | bug | chore
status: draft            # draft | agreed | planned | implementing | in-review | done
tier: standard           # small | standard — proposed by the planning session, confirmed by the user
issue:                   # tracker link, when a tracker is configured
planningLog: planning-log.jsonl   # the trimmed planning session, written when the plan is approved
---

## Problem

<What is wrong or missing, for whom, and how we know. For a bug: the observed
behaviour, the expected behaviour, and how to reproduce it.>

## Goals

1. <An outcome the change delivers.>

## Non-goals

- <What this change deliberately does not do, including what the session ruled out.>

## Premises

| # | Premise | Importance | Status | Evidence |
|---|---|---|---|---|
| P1 | <Something the change assumes is true.> | critical · normal | verified · refuted · unverified | [research/<slug>.md](research/<slug>.md): <the source kinds it rests on> · docs: <URL or file:line@version> · — |

## Requirements

1. <A plain, testable statement of behaviour.>

## Layout

<The directory layout of every new module or component, as a tree, with one
line per directory on what lives there. "No new modules or components" when
there are none.>

## Abstractions

<The main types and interfaces: each with its responsibility, what
identifies its instances, and who uses it.>

## Design

<The decisions and their rationale. For each decision with alternatives: the
options considered, the one chosen, and why. For each version pin: the
version and what the pin means (exact, minimum, or newest compatible).>

## Open questions

<Must be empty at status: agreed.>

<!-- writer-gaps: technical gaps the review found and fixed, one per line -->
