# Clubcal

A calendar subscription platform that connects student clubs with their members and broader student communities.

## Features

- **Club Calendar Creation** - Clubs can create and manage their own event calendars
- **Student Subscriptions** - Students can subscribe to club calendars to stay updated on events
- **Event Discovery** - Easily browse and attend more club events
- **Club Recognition** - Increase visibility and attendance for your club

## Live Demo

Visit the platform: https://clubcal.vercel.app

## Privacy & data visibility

ClubCal is a public directory. By design, the following are readable by anyone:

- **Approved clubs** (name, school) appear in discovery and search.
- **All events** are world-readable so calendar feeds and discovery work without sign-in — there is no concept of a private event.
- **Calendar feed URLs** (`.../ical-feed?club=…`) are unauthenticated; anyone with the link can subscribe.

Club account emails are only exposed through the token-gated admin endpoint, never to the public. Do not put anything in an event title, description, or location that should stay private.

## Current Status

🚧 Actively improving UI and user experience

---

Bridging the gap between clubs and students by making event discovery seamless and community engagement effortless.
