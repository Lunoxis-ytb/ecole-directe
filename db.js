// ══ DATABASE — Supabase pour persistance cloud ══
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

console.log("[DB] Supabase connecte a:", process.env.SUPABASE_URL);

module.exports = {
  // ── Sessions ──
  async saveSession(userId, token, prenom, nom, accountData) {
    const { error } = await supabase
      .from("sessions")
      .upsert({
        user_id: userId,
        token,
        prenom,
        nom,
        account_data: accountData || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
    if (error) console.error("[DB] saveSession error:", error.message);
  },

  async loadSession() {
    const { data, error } = await supabase
      .from("sessions")
      .select("*")
      .limit(1)
      .single();
    if (error && error.code !== "PGRST116") {
      console.error("[DB] loadSession error:", error.message);
    }
    if (!data) return null;
    return {
      user_id: data.user_id,
      token: data.token,
      prenom: data.prenom,
      nom: data.nom,
      account_data: data.account_data,
    };
  },

  async deleteSession(userId) {
    if (userId) {
      const { error } = await supabase
        .from("sessions")
        .delete()
        .eq("user_id", userId);
      if (error) console.error("[DB] deleteSession error:", error.message);
    } else {
      const { error } = await supabase
        .from("sessions")
        .delete()
        .neq("user_id", "");
      if (error) console.error("[DB] deleteAllSessions error:", error.message);
    }
  },

  // ── Grades cache ──
  async saveGradesCache(userId, data) {
    const { error } = await supabase
      .from("grades_cache")
      .upsert({
        user_id: userId,
        data,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
    if (error) console.error("[DB] saveGradesCache error:", error.message);
  },

  async loadGradesCache(userId) {
    const { data, error } = await supabase
      .from("grades_cache")
      .select("*")
      .eq("user_id", userId)
      .single();
    if (error && error.code !== "PGRST116") {
      console.error("[DB] loadGradesCache error:", error.message);
    }
    if (!data) return null;
    return { data: data.data, updated_at: data.updated_at };
  },

  // ── Homework cache ──
  async saveHomeworkCache(userId, data) {
    const { error } = await supabase
      .from("homework_cache")
      .upsert({
        user_id: userId,
        data,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
    if (error) console.error("[DB] saveHomeworkCache error:", error.message);
  },

  async loadHomeworkCache(userId) {
    const { data, error } = await supabase
      .from("homework_cache")
      .select("*")
      .eq("user_id", userId)
      .single();
    if (error && error.code !== "PGRST116") {
      console.error("[DB] loadHomeworkCache error:", error.message);
    }
    if (!data) return null;
    return {
      data: data.data,
      done_status: data.done_status || {},
      updated_at: data.updated_at,
    };
  },

  async saveHomeworkDone(userId, doneStatus) {
    const { error } = await supabase
      .from("homework_cache")
      .upsert({
        user_id: userId,
        data: {},
        done_status: doneStatus,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
    if (error) console.error("[DB] saveHomeworkDone error:", error.message);
  },

  // ── Schedule cache ──
  async saveScheduleCache(userId, weekStart, data) {
    const { error } = await supabase
      .from("schedule_cache")
      .upsert({
        user_id: userId,
        week_start: weekStart,
        data,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id,week_start" });
    if (error) console.error("[DB] saveScheduleCache error:", error.message);
  },

  async loadScheduleCache(userId, weekStart) {
    const { data, error } = await supabase
      .from("schedule_cache")
      .select("*")
      .eq("user_id", userId)
      .eq("week_start", weekStart)
      .single();
    if (error && error.code !== "PGRST116") {
      console.error("[DB] loadScheduleCache error:", error.message);
    }
    if (!data) return null;
    return { data: data.data, updated_at: data.updated_at };
  },
};
