
// ==========================================
// WICKETRA - SUPABASE CONNECTION
// ==========================================

const SUPABASE_URL = "https://dpioesaloceszadbzapm.supabase.co";
const SUPABASE_KEY = "sb_publishable_E5lkrWe8IImnVOA9CGbKfA_vZCsOOCD";

const db = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

let announcementTimer = null;
let leaderboardChannel = null;
let selectedTournamentId = null;

// ==========================================
// HELPER FUNCTIONS
// ==========================================

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function formatOvers(legalBalls) {
  return `${Math.floor(legalBalls / 6)}.${legalBalls % 6}`;
}

function formatDate(date) {
  if (!date) return "Date not announced";

  return new Date(date).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

// ==========================================
// SHOW RUN ANNOUNCEMENT
// ==========================================

function showRunAnnouncement(delivery) {
  const announcement = document.getElementById("runAnnouncement");
  const announcementText = document.getElementById("runAnnouncementText");

  if (!announcement || !announcementText) return;

  const totalRuns =
    Number(delivery.runs_batter || 0) +
    Number(delivery.runs_extras || 0);

  announcementText.textContent =
    `${totalRuns} ${totalRuns === 1 ? "RUN" : "RUNS"}`;

  if (announcementTimer) {
    clearTimeout(announcementTimer);
  }

  announcement.hidden = false;
  announcement.classList.remove("show");

  void announcement.offsetWidth;

  announcement.classList.add("show");

  announcementTimer = setTimeout(() => {
    announcement.classList.remove("show");
    announcement.hidden = true;
  }, 3000);
}

// ==========================================
// LOAD MATCHES
// ==========================================

async function loadMatches() {
  const liveBox = document.getElementById("liveMatches");
  const upcomingBox = document.getElementById("upcomingMatches");
  const historyBox = document.getElementById("recentMatches");

  try {
    const [
      matchesResult,
      teamsResult,
      inningsResult,
      deliveriesResult
    ] = await Promise.all([
      db.from("matches").select("*"),
      db.from("teams").select("*"),
      db.from("match_innings").select("*"),
      db.from("deliveries").select("*")
    ]);

    if (matchesResult.error) throw matchesResult.error;
    if (teamsResult.error) throw teamsResult.error;
    if (inningsResult.error) throw inningsResult.error;
    if (deliveriesResult.error) throw deliveriesResult.error;

    const matches = matchesResult.data || [];
    const teams = teamsResult.data || [];
    const innings = inningsResult.data || [];
    const deliveries = deliveriesResult.data || [];

    window.wicketraInnings = innings;

    window.wicketraLiveMatchIds = new Set(
      matches
        .filter(match =>
          ["live", "in_progress", "ongoing"].includes(
            String(match.status || "").toLowerCase()
          )
        )
        .map(match => match.id)
    );

    const teamMap = new Map(
      teams.map(team => [team.id, team])
    );

    const inningsMap = new Map();

    innings.forEach(inning => {
      const balls = deliveries.filter(
        delivery => delivery.innings_id === inning.id
      );

      let runs = 0;
      let wickets = 0;
      let legalBalls = 0;

      balls.forEach(ball => {
        runs += Number(ball.runs_batter || 0);
        runs += Number(ball.runs_extras || 0);

        if (ball.is_wicket) wickets++;
        if (ball.is_legal) legalBalls++;
      });

      inningsMap.set(inning.id, {
        runs,
        wickets,
        legalBalls,
        overs: formatOvers(legalBalls),
        teamId: inning.batting_team_id
      });
    });

    const live = [];
    const upcoming = [];
    const completed = [];

    matches.forEach(match => {
      const status = String(match.status || "").toLowerCase();

      if (["live", "in_progress", "ongoing"].includes(status)) {
        live.push(match);
      } else if (["completed", "finished", "result"].includes(status)) {
        completed.push(match);
      } else {
        upcoming.push(match);
      }
    });

    liveBox.innerHTML = renderMatchCards(
      live, teamMap, inningsMap, "LIVE"
    );

    upcomingBox.innerHTML = renderMatchCards(
      upcoming, teamMap, inningsMap, "UPCOMING"
    );

    historyBox.innerHTML = renderMatchCards(
      completed, teamMap, inningsMap, "COMPLETED"
    );

  } catch (error) {
    console.error("WICKETRA database error:", error);

    const message =
      "Unable to load matches. Please check your database connection.";

    liveBox.innerHTML = `<div class="empty-state">${message}</div>`;
    upcomingBox.innerHTML = `<div class="empty-state">${message}</div>`;
    historyBox.innerHTML = `<div class="empty-state">${message}</div>`;
  }
}

// ==========================================
// DISPLAY MATCH CARDS
// ==========================================

function renderMatchCards(matches, teamMap, inningsMap, label) {
  if (!matches.length) {
    return `<div class="empty-state">No ${label.toLowerCase()} matches available yet.</div>`;
  }

  return matches.map(match => {
    const teamA = teamMap.get(match.team_a_id);
    const teamB = teamMap.get(match.team_b_id);

    const scoreRows = (window.wicketraInnings || []).filter(
      inning => inning.match_id === match.id
    );

    const scoreHTML = scoreRows.map(inning => {
      const score = inningsMap.get(inning.id);
      const team = teamMap.get(inning.batting_team_id);

      if (!score) return "";

      return `
        <div class="match-teams">
          <span class="team-name">
            ${escapeHTML(team?.short_name || team?.name || "Team")}
          </span>
          <span class="team-score">
            ${score.runs}/${score.wickets}
            <small>(${score.overs})</small>
          </span>
        </div>
      `;
    }).join("");

    return `
      <article class="match-card">
        <div class="match-status">${escapeHTML(label)}</div>

        <h3>${escapeHTML(match.title || "Cricket Match")}</h3>

        ${scoreHTML || `
          <div class="match-teams">
            <span class="team-name">
              ${escapeHTML(teamA?.short_name || teamA?.name || "Team A")}
            </span>
            <span class="team-score">VS</span>
          </div>
          <div class="match-teams">
            <span class="team-name">
              ${escapeHTML(teamB?.short_name || teamB?.name || "Team B")}
            </span>
          </div>
        `}

        <div class="match-meta">
          ${escapeHTML(match.format || "Cricket")} ·
          ${escapeHTML(match.venue || "Venue not announced")}
          <br>
          ${formatDate(match.scheduled_at)}
        </div>
      </article>
    `;
  }).join("");
}

// ==========================================
// LOAD TOURNAMENT DROPDOWN
// ==========================================

async function loadTournaments() {
  const select = document.getElementById("tournamentSelect");
  const content = document.getElementById("leaderboardContent");

  if (!select || !content) return;

  try {
    const { data, error } = await db
      .from("tournaments")
      .select("id, name, status, start_date")
      .order("start_date", { ascending: false });

    if (error) throw error;

    const tournaments = data || [];

    if (!tournaments.length) {
      select.innerHTML = `<option value="">No tournaments available</option>`;
      content.innerHTML = `
        <div class="empty-state">
          No tournaments have been created yet.
        </div>
      `;
      return;
    }

    select.innerHTML = tournaments.map(tournament => `
      <option value="${escapeHTML(tournament.id)}">
        ${escapeHTML(tournament.name)}
      </option>
    `).join("");

    const savedTournamentExists = tournaments.some(
      tournament => tournament.id === selectedTournamentId
    );

    selectedTournamentId = savedTournamentExists
      ? selectedTournamentId
      : tournaments[0].id;

    select.value = selectedTournamentId;

    await loadLeaderboard(selectedTournamentId);

  } catch (error) {
    console.error("Tournament loading error:", error);

    select.innerHTML = `<option value="">Unable to load tournaments</option>`;

    content.innerHTML = `
      <div class="empty-state">
        Unable to load tournaments. Please check database permissions.
      </div>
    `;
  }
}

// ==========================================
// LOAD TOURNAMENT LEADERBOARD
// ==========================================

async function loadLeaderboard(tournamentId) {
  const content = document.getElementById("leaderboardContent");

  if (!content || !tournamentId) return;

  content.innerHTML = `
    <div class="empty-state">Loading tournament standings...</div>
  `;

  try {
    const { data, error } = await db
      .from("tournament_leaderboard")
      .select("*")
      .eq("tournament_id", tournamentId)
      .order("position", { ascending: true });

    if (error) throw error;

    const standings = data || [];

    if (!standings.length) {
      content.innerHTML = `
        <div class="empty-state">
          No teams have been registered in this tournament yet.
        </div>
      `;
      return;
    }

    content.innerHTML = `
      <div class="leaderboard-table-wrap">
        <table class="leaderboard-table">
          <thead>
            <tr>
              <th>POS</th>
              <th>TEAM</th>
              <th>PLAYED</th>
              <th>W</th>
              <th>L</th>
              <th>T</th>
              <th>POINTS</th>
              <th>NRR</th>
            </tr>
          </thead>

          <tbody>
            ${standings.map(team => `
              <tr>
                <td class="position-cell">
                  ${Number(team.position)}
                </td>

                <td class="leaderboard-team">
                  ${escapeHTML(team.team_name)}
                </td>

                <td>${Number(team.matches_played || 0)}</td>
                <td>${Number(team.wins || 0)}</td>
                <td>${Number(team.losses || 0)}</td>
                <td>${Number(team.ties || 0)}</td>

                <td class="points-cell">
                  ${Number(team.points || 0)}
                </td>

                <td class="nrr-cell">
                  ${Number(team.net_run_rate || 0) > 0 ? "+" : ""}
                  ${Number(team.net_run_rate || 0).toFixed(3)}
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>

      <p class="leaderboard-note">
        Rankings are sorted automatically by points, NRR and wins.
      </p>
    `;

  } catch (error) {
    console.error("Leaderboard loading error:", error);

    content.innerHTML = `
      <div class="empty-state">
        Unable to load standings. Check the browser console for details.
      </div>
    `;
  }
}

// ==========================================
// TOURNAMENT SELECTION
// ==========================================

function initializeTournamentSelection() {
  const select = document.getElementById("tournamentSelect");

  if (!select) return;

  select.addEventListener("change", async () => {
    selectedTournamentId = select.value;

    await loadLeaderboard(selectedTournamentId);
  });
}

// ==========================================
// REFRESH WEBSITE DATA
// ==========================================

async function refreshWicketra() {
  await loadMatches();
}

// ==========================================
// HANDLE NEW DELIVERY
// ==========================================

function handleNewDelivery(payload) {
  const delivery = payload.new;

  if (!delivery || !delivery.innings_id) return;

  const inning = (window.wicketraInnings || []).find(
    item => item.id === delivery.innings_id
  );

  if (!inning) return;

  const liveMatchIds = window.wicketraLiveMatchIds || new Set();

  if (!liveMatchIds.has(inning.match_id)) return;

  showRunAnnouncement(delivery);
}

// ==========================================
// REALTIME SUBSCRIPTIONS
// ==========================================

function initializeRealtime() {
  db.channel("wicketra-live")

    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "matches"
    }, async () => {
      await refreshWicketra();
      await loadLeaderboard(selectedTournamentId);
    })

    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "match_innings"
    }, refreshWicketra)

    .on("postgres_changes", {
      event: "INSERT",
      schema: "public",
      table: "deliveries"
    }, async payload => {
      handleNewDelivery(payload);
      await refreshWicketra();
    })

    .on("postgres_changes", {
      event: "DELETE",
      schema: "public",
      table: "deliveries"
    }, refreshWicketra)

    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "tournament_standings"
    }, async () => {
      await loadLeaderboard(selectedTournamentId);
    })

    .subscribe(status => {
      console.log("WICKETRA Realtime:", status);
    });
}

// ==========================================
// INITIALIZE WEBSITE
// ==========================================

document.addEventListener("DOMContentLoaded", async () => {
  initializeTournamentSelection();

  await refreshWicketra();

  await loadTournaments();

  initializeRealtime();
});
