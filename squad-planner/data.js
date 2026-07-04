import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const db = getFirestore(app);

const EMPTY_ELIGIBILITY_CONFIG = { boys: { brackets: [] }, girls: { brackets: [] } };

export async function getEligibilityConfig() {
  const snap = await getDoc(doc(db, "config", "eligibility"));
  return snap.exists() ? snap.data() : EMPTY_ELIGIBILITY_CONFIG;
}

export function saveEligibilityConfig(config) {
  return setDoc(doc(db, "config", "eligibility"), config);
}

export async function getTeamsConfig() {
  const snap = await getDoc(doc(db, "config", "teams"));
  return snap.exists() ? snap.data().teams : [];
}

export function saveTeamsConfig(teams) {
  return setDoc(doc(db, "config", "teams"), { teams });
}

export async function getAssignments() {
  const snap = await getDocs(collection(db, "assignments"));
  const result = {};
  snap.forEach((d) => {
    result[d.id] = d.data();
  });
  return result;
}

export function saveAssignment(playerId, assignment) {
  return setDoc(doc(db, "assignments", playerId), assignment);
}

export async function getManualPlayers() {
  const snap = await getDocs(collection(db, "manualPlayers"));
  const result = [];
  snap.forEach((d) => result.push({ id: d.id, manual: true, ...d.data() }));
  return result;
}

export function saveManualPlayer(id, player) {
  return setDoc(doc(db, "manualPlayers", id), player);
}

export async function getPlayerOverrides() {
  const snap = await getDocs(collection(db, "playerOverrides"));
  const result = {};
  snap.forEach((d) => {
    result[d.id] = d.data();
  });
  return result;
}

export function savePlayerOverride(playerId, override) {
  return setDoc(doc(db, "playerOverrides", playerId), override, { merge: true });
}
