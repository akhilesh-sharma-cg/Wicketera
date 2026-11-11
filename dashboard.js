// ==========================================
// WICKETRA - ADMIN DASHBOARD
// ==========================================

// SUPABASE CONFIGURATION
const SUPABASE_URL = "https://dpioesaloceszadbzapm.supabase.co";
const SUPABASE_KEY = "sb_publishable_E5lkrWe8IImnVOA9CGbKfA_vZCsOOCD";

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ==========================================
// GLOBAL STATE
// ==========================================

let currentAdmin = null;
let currentInningsId = null;
let selectedRuns = 0;
let selectedMatch = null;
let selectedBattingTeam = null;

// ==========================================
// HELPER FUNCTIONS
// ==========================================

function getElement(id) {
    return document.getElementById(id);
}

function showMessage(id, message, isError = false) {
    const element = getElement(id);
    if (!element) return;

    element.textContent = message;
    element.style.color = isError ? "#ff7777" : "#b6ff4a";
}

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[character]);
}

function oversFromBalls(balls) {
    return `${Math.floor(balls / 6)}.${balls % 6}`;
}

// ==========================================
// ADMIN AUTHENTICATION
// ==========================================

async function verifyAdmin() {
    const { data: { user }, error } = await db.auth.getUser();

    if (error || !user) {
        window.location.href = "admin.html";
        return;
    }

    const { data: role, error: roleError } = await db
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();

    if (roleError || !role || role.role !== "admin") {
        await db.auth.signOut();
        alert("Administrator access required.");
        window.location.href = "admin.html";
        return;
    }

    currentAdmin = user;

    const adminName = getElement("adminName");
    if (adminName) adminName.textContent = user.email;

    await loadTeams();
    await loadPlayers();
    await loadMatches();
    await initializeTournamentManagement();
}

async function logout() {
    await db.auth.signOut();
    window.location.href = "admin.html";
}

document.addEventListener("DOMContentLoaded", () => {
    getElement("logoutButton")?.addEventListener("click", logout);
});

// ==========================================
// TEAM MANAGEMENT
// ==========================================

async function loadTeams() {
    const { data, error } = await db
        .from("teams")
        .select("*")
        .order("name");

    if (error) {
        showMessage("teamMessage", error.message, true);
        return;
    }

    const teamList = getElement("teamsList");

    if (teamList) {
        teamList.innerHTML = data.length
            ? data.map(team => `
                <div class="team-item">
                    <strong>${escapeHTML(team.name)}</strong>
                    <small>
                        ${escapeHTML(team.short_name || "")}
                        ${escapeHTML(team.city || "")}
                    </small>
                </div>
            `).join("")
            : "<p>No teams added yet.</p>";
    }

    ["playerTeam", "teamA", "teamB", "battingTeam"].forEach(id => {
        const select = getElement(id);
        if (!select) return;

        const previousValue = select.value;

        select.innerHTML =
            '<option value="">Select team</option>' +
            data.map(team => `
                <option value="${team.id}">
                    ${escapeHTML(team.name)}
                </option>
            `).join("");

        if (data.some(team => team.id === previousValue)) {
            select.value = previousValue;
        }
    });
}

getElement("teamForm")?.addEventListener("submit", async event => {
    event.preventDefault();
    if (!currentAdmin) return;

    const name = getElement("teamName").value.trim();
    const shortName = getElement("teamShortName").value.trim();
    const city = getElement("teamCity").value.trim();

    if (!name) {
        showMessage("teamMessage", "Enter a team name.", true);
        return;
    }

    const button = getElement("addTeamButton");
    if (button) button.disabled = true;

    const { error } = await db.from("teams").insert({
        name,
        short_name: shortName || null,
        city: city || null
    });

    if (button) button.disabled = false;

    if (error) {
        showMessage("teamMessage", error.message, true);
        return;
    }

    event.target.reset();
    showMessage("teamMessage", "Team added successfully!");

    await loadTeams();
    await loadTournamentTeams();
});

// ==========================================
// PLAYER MANAGEMENT
// ==========================================

async function loadPlayers() {
    const { data, error } = await db
        .from("players")
        .select("*, teams(name)")
        .order("name");

    if (error) {
        showMessage("playerMessage", error.message, true);
        return;
    }

    const list = getElement("playersList");

    if (list) {
        list.innerHTML = data.length
            ? data.map(player => `
                <div class="player-item">
                    <strong>${escapeHTML(player.name)}</strong>
                    <small>
                        ${escapeHTML(player.teams?.name || "Unknown team")}
                        · ${escapeHTML(player.role || "Player")}
                    </small>
                </div>
            `).join("")
            : "<p>No players added yet.</p>";
    }
}

getElement("playerForm")?.addEventListener("submit", async event => {
    event.preventDefault();
    if (!currentAdmin) return;

    const name = getElement("playerName").value.trim();
    const teamId = getElement("playerTeam").value;
    const role = getElement("playerRole").value;

    if (!name || !teamId) {
        showMessage("playerMessage", "Enter a name and select a team.", true);
        return;
    }

    const button = getElement("addPlayerButton");
    if (button) button.disabled = true;

    const { error } = await db.from("players").insert({
        name,
        team_id: teamId,
        role
    });

    if (button) button.disabled = false;

    if (error) {
        showMessage("playerMessage", error.message, true);
        return;
    }

    event.target.reset();
    showMessage("playerMessage", "Player added successfully!");
    await loadPlayers();
});

// ==========================================
// MATCH MANAGEMENT
// ==========================================

async function loadMatches() {
    const { data, error } = await db
        .from("matches")
        .select(`
            *,
            team_a:teams!matches_team_a_id_fkey(name),
            team_b:teams!matches_team_b_id_fkey(name)
        `)
        .order("scheduled_at", { ascending: false });

    if (error) {
        showMessage("matchMessage", error.message, true);
        return;
    }

    const list = getElement("matchesList");

    if (list) {
        list.innerHTML = data.length
            ? data.map(match => `
                <div class="team-item">
                    <strong>
                        ${escapeHTML(match.team_a?.name || "Team A")}
                        vs
                        ${escapeHTML(match.team_b?.name || "Team B")}
                    </strong>
                    <small>
                        ${escapeHTML(match.format)}
                        · ${escapeHTML(match.status)}
                    </small>
                </div>
            `).join("")
            : "<p>No matches created yet.</p>";
    }

    const selector = getElement("scoringMatch");

    if (selector) {
        const previous = selector.value;

        selector.innerHTML =
            '<option value="">Select match</option>' +
            data.map(match => `
                <option value="${match.id}">
                    ${escapeHTML(match.team_a?.name || "Team A")}
                    vs
                    ${escapeHTML(match.team_b?.name || "Team B")}
                    (${escapeHTML(match.status)})
                </option>
            `).join("");

        if (data.some(match => match.id === previous)) {
            selector.value = previous;
        }
    }
}

getElement("matchForm")?.addEventListener("submit", async event => {
    event.preventDefault();
    if (!currentAdmin) return;

    const title = getElement("matchTitle").value.trim();
    const teamA = getElement("teamA").value;
    const teamB = getElement("teamB").value;
    const format = getElement("matchFormat").value;
    const overs = Number(getElement("matchOvers").value);
    const venue = getElement("matchVenue").value.trim();
    const scheduledAt = getElement("matchDate").value;

    if (!teamA || !teamB || teamA === teamB) {
        showMessage("matchMessage", "Select two different teams.", true);
        return;
    }

    if (!Number.isInteger(overs) || overs < 1) {
        showMessage("matchMessage", "Enter a valid number of overs.", true);
        return;
    }

    const button = getElement("createMatchButton");
    if (button) button.disabled = true;

    const { error } = await db.from("matches").insert({
        title: title || `${teamA} vs ${teamB}`,
        team_a_id: teamA,
        team_b_id: teamB,
        format,
        overs_per_innings: overs,
        venue: venue || null,
        scheduled_at: scheduledAt || null,
        created_by: currentAdmin.id,
        status: "upcoming"
    });

    if (button) button.disabled = false;

    if (error) {
        showMessage("matchMessage", error.message, true);
        return;
    }

    event.target.reset();
    showMessage("matchMessage", "Match created successfully!");
    await loadMatches();
});

// ==========================================
// SCORING - MATCH SELECTION
// ==========================================

getElement("scoringMatch")?.addEventListener("change", async event => {
    selectedMatch = event.target.value || null;
    currentInningsId = null;

    showMessage("inningsMessage", "");
    showMessage("scoringMessage", "");

    if (getElement("currentScore")) {
        getElement("currentScore").textContent = "0/0";
    }

    if (getElement("currentOvers")) {
        getElement("currentOvers").textContent = "0.0 overs";
    }

    if (!selectedMatch) return;

    await loadSelectedMatchTeams();
});

async function loadSelectedMatchTeams() {
    const { data: match, error } = await db
        .from("matches")
        .select("team_a_id, team_b_id")
        .eq("id", selectedMatch)
        .single();

    if (error) {
        showMessage("inningsMessage", error.message, true);
        return;
    }

    const teamSelect = getElement("battingTeam");

    if (teamSelect) {
        teamSelect.innerHTML = '<option value="">Select batting team</option>';

        const { data: teams, error: teamError } = await db
            .from("teams")
            .select("id, name")
            .in("id", [match.team_a_id, match.team_b_id]);

        if (teamError) {
            showMessage("inningsMessage", teamError.message, true);
            return;
        }

        teams.forEach(team => {
            teamSelect.innerHTML += `
                <option value="${team.id}">
                    ${escapeHTML(team.name)}
                </option>
            `;
        });
    }

    await loadExistingInnings();
}

// ==========================================
// LOAD EXISTING INNINGS
// ==========================================

async function loadExistingInnings() {
    const { data, error } = await db
        .from("match_innings")
        .select("*")
        .eq("match_id", selectedMatch)
        .order("innings_number", { ascending: false })
        .limit(1);

    if (error) {
        showMessage("inningsMessage", error.message, true);
        return;
    }

    if (data.length && data[0].status === "in_progress") {
        currentInningsId = data[0].id;
        selectedBattingTeam = data[0].batting_team_id;

        getElement("battingTeam").value = selectedBattingTeam;

        await loadScoringPlayers();
        await refreshScore();

        showMessage("inningsMessage", "Active innings loaded.");
    } else {
        currentInningsId = null;
        selectedBattingTeam = null;

        showMessage(
            "inningsMessage",
            data.length
                ? "Previous innings completed. Select the next batting team to start."
                : "Select a batting team and start the innings."
        );

        await clearScoringPlayers();
    }
}

// ==========================================
// START INNINGS
// ==========================================

getElement("startInningsButton")?.addEventListener("click", async () => {
    if (!currentAdmin || !selectedMatch) {
        showMessage("inningsMessage", "Select a match first.", true);
        return;
    }

    const battingTeam = getElement("battingTeam").value;

    if (!battingTeam) {
        showMessage("inningsMessage", "Select a batting team.", true);
        return;
    }

    const button = getElement("startInningsButton");
    if (button) button.disabled = true;

    const { data, error } = await db.rpc("start_match_innings", {
        p_match_id: selectedMatch,
        p_batting_team_id: battingTeam
    });

    if (button) button.disabled = false;

    if (error) {
        showMessage("inningsMessage", error.message, true);
        return;
    }

    currentInningsId = data;
    selectedBattingTeam = battingTeam;

    showMessage("inningsMessage", "Innings started successfully!");

    await loadScoringPlayers();
    await refreshScore();
    await loadMatches();
});

// ==========================================
// SCORING PLAYER SELECTORS
// ==========================================

async function clearScoringPlayers() {
    ["scoringBatter", "scoringBowler", "dismissedPlayer"].forEach(id => {
        const select = getElement(id);

        if (select) {
            select.innerHTML = '<option value="">Select player</option>';
        }
    });
}

async function loadScoringPlayers() {
    if (!selectedMatch || !selectedBattingTeam) return;

    const { data: innings, error } = await db
        .from("match_innings")
        .select("bowling_team_id")
        .eq("id", currentInningsId)
        .single();

    if (error) {
        showMessage("scoringMessage", error.message, true);
        return;
    }

    const { data: battingPlayers, error: battingError } = await db
        .from("players")
        .select("id, name")
        .eq("team_id", selectedBattingTeam)
        .order("name");

    if (battingError) {
        showMessage("scoringMessage", battingError.message, true);
        return;
    }

    const { data: bowlingPlayers, error: bowlingError } = await db
        .from("players")
        .select("id, name")
        .eq("team_id", innings.bowling_team_id)
        .order("name");

    if (bowlingError) {
        showMessage("scoringMessage", bowlingError.message, true);
        return;
    }

    ["scoringBatter", "dismissedPlayer"].forEach(id => {
        const select = getElement(id);
        if (!select) return;

        select.innerHTML =
            '<option value="">Select player</option>' +
            battingPlayers.map(player => `
                <option value="${player.id}">
                    ${escapeHTML(player.name)}
                </option>
            `).join("");
    });

    const bowlerSelect = getElement("scoringBowler");

    if (bowlerSelect) {
        bowlerSelect.innerHTML =
            '<option value="">Select bowler</option>' +
            bowlingPlayers.map(player => `
                <option value="${player.id}">
                    ${escapeHTML(player.name)}
                </option>
            `).join("");
    }
}

// ==========================================
// RUN BUTTONS
// ==========================================

document.querySelectorAll(".run-button").forEach(button => {
    button.addEventListener("click", () => {
        selectedRuns = Number(button.dataset.runs);

        document.querySelectorAll(".run-button").forEach(item => {
            item.classList.remove("active");
        });

        button.classList.add("active");

        const display = getElement("selectedRuns");
        if (display) display.textContent = selectedRuns;
    });
});

// ==========================================
// RECORD DELIVERY
// ==========================================

getElement("recordBallButton")?.addEventListener("click", async () => {
    if (!currentAdmin || !currentInningsId) {
        showMessage("scoringMessage", "Start an innings first.", true);
        return;
    }

    const batterId = getElement("scoringBatter").value;
    const bowlerId = getElement("scoringBowler").value;
    const extraType = getElement("extraType").value;
    const extraRuns = Number(getElement("extraRuns").value || 0);
    const wicketType = getElement("wicketType").value;
    const dismissedPlayerId = getElement("dismissedPlayer").value;
    const commentary = getElement("deliveryCommentary").value.trim();

    if (!batterId || !bowlerId) {
        showMessage("scoringMessage", "Select batter and bowler.", true);
        return;
    }

    if (!Number.isInteger(extraRuns) || extraRuns < 0) {
        showMessage("scoringMessage", "Invalid extra runs.", true);
        return;
    }

    if (["wide", "no_ball"].includes(extraType) && extraRuns < 1) {
        showMessage("scoringMessage", "Wide and no-ball must include at least 1 extra run.", true);
        return;
    }

    if (["wide", "bye", "leg_bye"].includes(extraType) && selectedRuns !== 0) {
        showMessage("scoringMessage", "Batter runs must be zero for this extra type.", true);
        return;
    }

    if (wicketType && !dismissedPlayerId) {
        showMessage("scoringMessage", "Select the dismissed player.", true);
        return;
    }

    if (!wicketType && dismissedPlayerId) {
        showMessage("scoringMessage", "Select a wicket type or clear dismissed player.", true);
        return;
    }

    const button = getElement("recordBallButton");
    if (button) button.disabled = true;

    const { error } = await db.rpc("score_delivery", {
        p_innings_id: currentInningsId,
        p_batter_id: batterId,
        p_bowler_id: bowlerId,
        p_runs_batter: selectedRuns,
        p_runs_extras: extraRuns,
        p_extra_type: extraType,
        p_is_wicket: Boolean(wicketType),
        p_wicket_type: wicketType || null,
        p_dismissed_player_id: dismissedPlayerId || null,
        p_commentary: commentary || null
    });

    if (button) button.disabled = false;

    if (error) {
        showMessage("scoringMessage", error.message, true);
        return;
    }

    selectedRuns = 0;

    document.querySelectorAll(".run-button").forEach(item => {
        item.classList.remove("active");
    });

    if (getElement("selectedRuns")) {
        getElement("selectedRuns").textContent = "0";
    }

    getElement("extraRuns").value = "0";
    getElement("extraType").value = "none";
    getElement("wicketType").value = "";
    getElement("dismissedPlayer").value = "";
    getElement("deliveryCommentary").value = "";

    showMessage("scoringMessage", "Delivery recorded successfully!");
    await refreshScore();
});

// ==========================================
// REFRESH SCORE AND BALL HISTORY
// ==========================================

async function refreshScore() {
    if (!currentInningsId) return;

    const { data: innings, error: inningsError } = await db
        .from("match_innings")
        .select("*")
        .eq("id", currentInningsId)
        .single();

    if (inningsError) {
        showMessage("scoringMessage", inningsError.message, true);
        return;
    }

    const { data: deliveries, error } = await db
        .from("deliveries")
        .select("*")
        .eq("innings_id", currentInningsId)
        .order("ball_sequence", { ascending: false });

    if (error) {
        showMessage("scoringMessage", error.message, true);
        return;
    }

    let runs = 0;
    let wickets = 0;
    let legalBalls = 0;

    deliveries.forEach(ball => {
        runs += Number(ball.runs_batter || 0) +
                Number(ball.runs_extras || 0);

        if (ball.is_wicket) wickets++;
        if (ball.is_legal) legalBalls++;
    });

    if (getElement("currentScore")) {
        getElement("currentScore").textContent = `${runs}/${wickets}`;
    }

    if (getElement("currentOvers")) {
        getElement("currentOvers").textContent =
            `${oversFromBalls(legalBalls)} overs`;
    }

    if (getElement("currentInningsInfo")) {
        getElement("currentInningsInfo").textContent =
            `Innings ${innings.innings_number} · ${innings.status}`;
    }

    const history = getElement("deliveryHistory");

    if (history) {
        history.innerHTML = deliveries.length
            ? deliveries.slice(0, 12).map(ball => `
                <div class="delivery-item">
                    <span>Ball ${escapeHTML(ball.ball_sequence)}</span>
                    <strong>
                        ${escapeHTML(ball.runs_batter)} + ${escapeHTML(ball.runs_extras)}
                        ${ball.is_wicket ? " · WICKET" : ""}
                    </strong>
                    <span>${escapeHTML(ball.commentary || "")}</span>
                </div>
            `).join("")
            : "<p>No deliveries recorded yet.</p>";
    }

    if (innings.status !== "in_progress") {
        showMessage("scoringMessage", "This innings is completed. Start the next innings if available.");
    }
}

// ==========================================
// UNDO LAST DELIVERY
// ==========================================

getElement("undoBallButton")?.addEventListener("click", async () => {
    if (!currentAdmin || !currentInningsId) {
        showMessage("scoringMessage", "No active innings.", true);
        return;
    }

    const confirmed = confirm("Are you sure you want to undo the last delivery?");
    if (!confirmed) return;

    const button = getElement("undoBallButton");
    if (button) button.disabled = true;

    const { error } = await db.rpc("undo_last_delivery", {
        p_innings_id: currentInningsId
    });

    if (button) button.disabled = false;

    if (error) {
        showMessage("scoringMessage", error.message, true);
        return;
    }

    showMessage("scoringMessage", "Last delivery undone.");
    await refreshScore();
});

// ==========================================
// TOURNAMENT MANAGEMENT
// ==========================================

async function initializeTournamentManagement() {
    await loadTournamentTeams();
    await loadTournaments();
}

// ==========================================
// LOAD TOURNAMENTS
// ==========================================

async function loadTournaments() {
    const { data, error } = await db
        .from("tournaments")
        .select("id, name, format, status, start_date, venue, city")
        .order("start_date", { ascending: true });

    if (error) {
        showMessage("tournamentMessage", error.message, true);
        return;
    }

    const list = getElement("tournamentsList");

    if (list) {
        list.innerHTML = data.length
            ? data.map(tournament => `
                <div class="team-item">
                    <strong>${escapeHTML(tournament.name)}</strong>
                    <small>
                        ${escapeHTML(tournament.format)}
                        · ${escapeHTML(tournament.status)}
                        · ${escapeHTML(tournament.city)}
                    </small>
                </div>
            `).join("")
            : "<p>No tournaments created yet.</p>";
    }

    ["registerTournament", "fixtureTournament", "standingsTournament"].forEach(id => {
        const select = getElement(id);
        if (!select) return;

        const previous = select.value;

        select.innerHTML =
            '<option value="">Select tournament</option>' +
            data.map(tournament => `
                <option value="${tournament.id}">
                    ${escapeHTML(tournament.name)}
                </option>
            `).join("");

        if (data.some(item => item.id === previous)) {
            select.value = previous;
        }
    });

    return data;
}

// ==========================================
// DASHBOARD PAGE NAVIGATION
// ==========================================

function openDashboardPage(pageId) {
    const navLink = document.querySelector(
        `.dashboard-nav a[href="#${pageId}"],
         .dashboard-nav a[data-page="${pageId}"],
         .dashboard-nav [data-page="${pageId}"]`
    );

    if (navLink) {
        navLink.click();
        return;
    }

    const pageIds = [
        "overview",
        "createTournament",
        "allTournaments",
        "teams",
        "registerTeams",
        "fixtures",
        "standings",
        "players",
        "matches",
        "scoring"
    ];

    pageIds.forEach(id => {
        const page = getElement(id);
        if (page) page.hidden = id !== pageId;
    });

    document.querySelectorAll(".dashboard-nav a").forEach(link => {
        link.classList.toggle(
            "active",
            link.getAttribute("href") === `#${pageId}` ||
            link.dataset.page === pageId
        );
    });

    if (window.history && window.history.replaceState) {
        window.history.replaceState(null, "", `#${pageId}`);
    }
}

// ==========================================
// CREATE TOURNAMENT
// ==========================================

getElement("tournamentForm")?.addEventListener("submit", async event => {
    event.preventDefault();

    if (!currentAdmin) {
        showMessage("tournamentMessage", "Admin login required.", true);
        return;
    }

    const name = getElement("tournamentName").value.trim();
    const description = getElement("tournamentDescription").value.trim();
    const venue = getElement("tournamentVenue").value.trim();
    const city = getElement("tournamentCity").value.trim();
    const state = getElement("tournamentState").value.trim();
    const startDate = getElement("tournamentStart").value;
    const endDate = getElement("tournamentEnd").value;
    const format = getElement("tournamentFormat").value;
    const matchFormat = getElement("tournamentMatchFormat").value;
    const overs = Number(getElement("tournamentOvers").value);
    const entryFee = Number(getElement("tournamentEntryFee").value || 0);

    if (!name || !venue || !city || !startDate) {
        showMessage("tournamentMessage", "Fill all required fields.", true);
        return;
    }

    if (!Number.isInteger(overs) || overs < 1 || entryFee < 0) {
        showMessage("tournamentMessage", "Enter valid overs and entry fee.", true);
        return;
    }

    if (endDate && new Date(endDate) < new Date(startDate)) {
        showMessage("tournamentMessage", "End date cannot be before start date.", true);
        return;
    }

    const button = getElement("createTournamentButton");
    if (button) button.disabled = true;

    const { data: newTournament, error } = await db
        .from("tournaments")
        .insert({
            name,
            description: description || null,
            venue,
            city,
            state: state || null,
            start_date: new Date(startDate).toISOString(),
            end_date: endDate ? new Date(endDate).toISOString() : null,
            format,
            match_format: matchFormat,
            overs_per_innings: overs,
            entry_fee: entryFee,
            created_by: currentAdmin.id
        })
        .select("id, name")
        .single();

    if (button) button.disabled = false;

    if (error) {
        showMessage("tournamentMessage", error.message, true);
        return;
    }

    event.target.reset();

    // Refresh tournament list
    await loadTournaments();

    // Automatically select the new tournament
    const registerTournamentSelect = getElement("registerTournament");

    if (registerTournamentSelect) {
        registerTournamentSelect.value = newTournament.id;
    }

    // Refresh team dropdown
    await loadTournamentTeams();

    showMessage(
        "registerTeamMessage",
        `Now register teams for ${newTournament.name}.`
    );

    // Automatically open Register Teams page
    openDashboardPage("registerTeams");
});

// ==========================================
// LOAD TEAMS FOR TOURNAMENT REGISTRATION
// ==========================================

async function loadTournamentTeams() {
    const select = getElement("registerTournamentTeam");
    if (!select) return;

    const previous = select.value;

    const { data, error } = await db
        .from("teams")
        .select("id, name")
        .order("name");

    if (error) {
        showMessage("registerTeamMessage", error.message, true);
        return;
    }

    select.innerHTML =
        '<option value="">Select team</option>' +
        data.map(team => `
            <option value="${team.id}">
                ${escapeHTML(team.name)}
            </option>
        `).join("");

    if (data.some(team => team.id === previous)) {
        select.value = previous;
    }
}

// ==========================================
// REGISTER TEAM IN TOURNAMENT
// ==========================================

getElement("registerTournamentTeamButton")?.addEventListener("click", async () => {
    if (!currentAdmin) return;

    const tournamentId = getElement("registerTournament").value;
    const teamId = getElement("registerTournamentTeam").value;

    if (!tournamentId || !teamId) {
        showMessage("registerTeamMessage", "Select a tournament and a team.", true);
        return;
    }

    const button = getElement("registerTournamentTeamButton");
    if (button) button.disabled = true;

    const { error } = await db
        .from("tournament_teams")
        .insert({
            tournament_id: tournamentId,
            team_id: teamId
        });

    if (button) button.disabled = false;

    if (error) {
        showMessage(
            "registerTeamMessage",
            error.code === "23505"
                ? "This team is already registered."
                : error.message,
            true
        );
        return;
    }

    showMessage("registerTeamMessage", "Team registered successfully!");

    await loadTournamentFixtures(tournamentId);
});

// ==========================================
// GENERATE TOURNAMENT FIXTURES
// ==========================================

getElement("generateFixturesButton")?.addEventListener("click", async () => {
    if (!currentAdmin) return;

    const tournamentId = getElement("fixtureTournament").value;

    if (!tournamentId) {
        showMessage("fixtureMessage", "Select a tournament.", true);
        return;
    }

    const { data: tournament, error: tournamentError } = await db
        .from("tournaments")
        .select("format")
        .eq("id", tournamentId)
        .single();

    if (tournamentError) {
        showMessage("fixtureMessage", tournamentError.message, true);
        return;
    }

    let functionName;

    if (tournament.format === "league") {
        functionName = "generate_league_fixtures";
    } else if (tournament.format === "knockout") {
        functionName = "generate_knockout_fixtures";
    } else {
        showMessage(
            "fixtureMessage",
            "Group + Knockout fixture generation is not connected yet.",
            true
        );
        return;
    }

    const confirmed = confirm(
        "Generate fixtures for this tournament? Existing fixtures will not be overwritten."
    );

    if (!confirmed) return;

    const button = getElement("generateFixturesButton");
    if (button) button.disabled = true;

    const { data, error } = await db.rpc(functionName, {
        p_tournament_id: tournamentId
    });

    if (button) button.disabled = false;

    if (error) {
        showMessage("fixtureMessage", error.message, true);
        return;
    }

    showMessage(
        "fixtureMessage",
        `Fixtures generated successfully. Result: ${data}`
    );

    await loadTournamentFixtures(tournamentId);
    await loadTournaments();
});

// ==========================================
// DISPLAY TOURNAMENT FIXTURES
// ==========================================

async function loadTournamentFixtures(tournamentId) {
    const list = getElement("fixturesList");
    if (!list || !tournamentId) return;

    const { data: fixtures, error } = await db
        .from("tournament_fixtures")
        .select("*")
        .eq("tournament_id", tournamentId)
        .order("match_number");

    if (error) {
        list.textContent = error.message;
        return;
    }

    if (!fixtures.length) {
        list.innerHTML = "<p>No fixtures generated yet.</p>";
        return;
    }

    const teamIds = [
        ...new Set(
            fixtures.flatMap(fixture =>
                [fixture.team_a_id, fixture.team_b_id].filter(Boolean)
            )
        )
    ];

    const { data: teams, error: teamsError } = await db
        .from("teams")
        .select("id, name")
        .in(
            "id",
            teamIds.length
                ? teamIds
                : ["00000000-0000-0000-0000-000000000000"]
        );

    if (teamsError) {
        list.textContent = teamsError.message;
        return;
    }

    const teamNames = Object.fromEntries(
        teams.map(team => [team.id, team.name])
    );

    list.innerHTML = fixtures.map(fixture => `
        <div class="team-item">
            <strong>
                ${escapeHTML(teamNames[fixture.team_a_id] || "TBD")}
                vs
                ${escapeHTML(teamNames[fixture.team_b_id] || "TBD")}
            </strong>
            <small>
                ${escapeHTML(fixture.round_name)}
                · Match ${escapeHTML(fixture.match_number)}
                · ${escapeHTML(fixture.status)}
            </small>
        </div>
    `).join("");
}

// ==========================================
// FIXTURE SELECTOR
// ==========================================

getElement("fixtureTournament")?.addEventListener("change", event => {
    if (event.target.value) {
        loadTournamentFixtures(event.target.value);
    } else {
        const list = getElement("fixturesList");
        if (list) list.textContent = "Select a tournament to view fixtures.";
    }
});

// ==========================================
// TOURNAMENT POINTS TABLE
// ==========================================

async function loadTournamentStandings(tournamentId) {
    const container = getElement("tournamentStandings");
    if (!container) return;

    if (!tournamentId) {
        container.textContent = "Select a tournament to view standings.";
        return;
    }

    container.textContent = "Loading points table...";

    const { data, error } = await db
        .from("tournament_leaderboard")
        .select("*")
        .eq("tournament_id", tournamentId)
        .order("position");

    if (error) {
        container.textContent = error.message;
        return;
    }

    if (!data.length) {
        container.innerHTML =
            "<p>No standings available yet. Complete matches first.</p>";
        return;
    }

    container.innerHTML = `
        <div class="leaderboard-table-wrap">
            <table class="leaderboard-table">
                <thead>
                    <tr>
                        <th>POS</th>
                        <th>TEAM</th>
                        <th>PLAYED</th>
                        <th>W</th>
                        <th>L</th>
                        <th>POINTS</th>
                        <th>NRR</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.map(team => `
                        <tr>
                            <td>${escapeHTML(team.position)}</td>
                            <td>${escapeHTML(team.team_name)}</td>
                            <td>${escapeHTML(team.matches_played)}</td>
                            <td>${escapeHTML(team.wins)}</td>
                            <td>${escapeHTML(team.losses)}</td>
                            <td>${escapeHTML(team.points)}</td>
                            <td>${Number(team.net_run_rate).toFixed(3)}</td>
                        </tr>
                    `).join("")}
                </tbody>
            </table>
        </div>
    `;
}

getElement("standingsTournament")?.addEventListener("change", event => {
    loadTournamentStandings(event.target.value);
});

// ==========================================
// TOURNAMENT SELECTOR CONNECTIONS
// ==========================================

getElement("registerTournament")?.addEventListener("change", async event => {
    const tournamentId = event.target.value;

    if (tournamentId) {
        await loadTournamentFixtures(tournamentId);
    }
});

// ==========================================
// INITIALIZE DASHBOARD
// ==========================================

document.addEventListener("DOMContentLoaded", verifyAdmin);