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
  // ── Sessions (utilise id UUID = deviceId du navigateur) ──
  async saveSession(deviceId, userId, token, prenom, nom, accountData) {
    const { error } = await supabase
      .from("sessions")
      .upsert({
        id: deviceId,
        user_id: userId,
        token,
        prenom,
        nom,
        account_data: accountData || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "id" });
    if (error) console.error("[DB] saveSession error:", error.message);
  },

  async loadSession(deviceId) {
    const { data, error } = await supabase
      .from("sessions")
      .select("*")
      .eq("id", deviceId)
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

  async deleteSession(deviceId) {
    if (deviceId) {
      const { error } = await supabase
        .from("sessions")
        .delete()
        .eq("id", deviceId);
      if (error) console.error("[DB] deleteSession error:", error.message);
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
    // Mettre a jour SEULEMENT le done_status sans ecraser les donnees devoirs
    const { error } = await supabase
      .from("homework_cache")
      .update({
        done_status: doneStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);
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

  // ── Vie Scolaire cache ──
  // Note: la table viescolaire_cache doit etre creee dans Supabase :
  // CREATE TABLE viescolaire_cache (id uuid DEFAULT gen_random_uuid() PRIMARY KEY, user_id text UNIQUE NOT NULL, data jsonb, updated_at timestamptz);
  async saveVieScolaireCache(userId, data) {
    try {
      const { error } = await supabase
        .from("viescolaire_cache")
        .upsert({
          user_id: userId,
          data,
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" });
      if (error) console.warn("[DB] saveVieScolaireCache skipped (table may not exist):", error.message);
    } catch (err) {
      console.warn("[DB] saveVieScolaireCache skipped:", err.message);
    }
  },

  async loadVieScolaireCache(userId) {
    try {
      const { data, error } = await supabase
        .from("viescolaire_cache")
        .select("*")
        .eq("user_id", userId)
        .single();
      if (error) return null;
      if (!data) return null;
      return { data: data.data, updated_at: data.updated_at };
    } catch (err) {
      return null;
    }
  },
};
