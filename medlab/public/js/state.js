// ══════════════════════════════════════════════════════
// SHARED MUTABLE STATE
// ══════════════════════════════════════════════════════
export let token = localStorage.getItem('medlab_token');
export let currentUser = null;
export let tests = [];
export let currentCategory = 'all';
export let currentPage = 1;
export let totalPages = 1;
export let searchDebounceTimer = null;
export let editingTestId = null;
export let paramRowCount = 0;
export let currentAttachments = [];
export let members = [];
export let currentMemberId = null;
export let editingMemberId = null;
export const charts = {};

export function setToken(v)               { token = v; }
export function setCurrentUser(v)         { currentUser = v; }
export function setTests(v)               { tests = v; }
export function setCurrentCategory(v)     { currentCategory = v; }
export function setCurrentPage(v)         { currentPage = v; }
export function setTotalPages(v)          { totalPages = v; }
export function setSearchDebounceTimer(v) { searchDebounceTimer = v; }
export function setEditingTestId(v)       { editingTestId = v; }
export function setParamRowCount(v)       { paramRowCount = v; }
export function setCurrentAttachments(v)  { currentAttachments = v; }
export function setMembers(v)             { members = v; }
export function setCurrentMemberId(v)     { currentMemberId = v; }
export function setEditingMemberId(v)     { editingMemberId = v; }
