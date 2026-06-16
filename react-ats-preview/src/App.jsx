import { useEffect, useState, useMemo } from "react";
import * as XLSX from "xlsx";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.mjs?url";
import mammoth from "mammoth/mammoth.browser";
import {
  authConfigReady,
  backendActions,
  completeMicrosoftRedirect,
  fetchAtsData,
  fetchFileBlob,
  logout,
  mapHiringRequest,
  microsoftLogin,
  restoreSession,
} from "./backend.js";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

// ── DESIGN TOKENS ─────────────────────────────────────────────────────────────
const css = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,300&family=DM+Mono:wght@400;500&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg: #f5f6fa;
    --bg2: #ffffff;
    --bg3: #f0f2f7;
    --bg4: #e4e7f0;
    --border: rgba(0,0,0,0.08);
    --border2: rgba(0,0,0,0.14);
    --text: #1a1d2e;
    --text2: #4a5068;
    --text3: #9298b0;
    --accent: #3b72d9;
    --accent2: #2c5ab8;
    --accent-soft: rgba(59,114,217,0.10);
    --teal: #0d9e88;
    --teal-soft: rgba(13,158,136,0.10);
    --amber: #d97706;
    --amber-soft: rgba(217,119,6,0.10);
    --red: #dc2626;
    --red-soft: rgba(220,38,38,0.10);
    --green: #16a34a;
    --green-soft: rgba(22,163,74,0.10);
    --purple: #7c3aed;
    --purple-soft: rgba(124,58,237,0.10);
    --coral: #ea580c;
    --coral-soft: rgba(234,88,12,0.10);
    --radius: 8px;
    --radius-lg: 12px;
    --radius-xl: 16px;
    --font: 'DM Sans', sans-serif;
    --mono: 'DM Mono', monospace;
    --shadow: 0 4px 24px rgba(0,0,0,0.10);
    --shadow-sm: 0 2px 8px rgba(0,0,0,0.07);
  }

  body { font-family: var(--font); background: var(--bg); color: var(--text); font-size: 14px; line-height: 1.5; }

  /* scrollbar */
  ::-webkit-scrollbar { width: 4px; height: 4px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--bg4); border-radius: 4px; }

  .app { display: flex; height: 100vh; overflow: hidden; }

  /* SIDEBAR */
  .sidebar { width: 220px; flex-shrink: 0; background: #1e2535; border-right: 1px solid rgba(255,255,255,0.06); display: flex; flex-direction: column; padding: 0; }
  .sidebar-logo { padding: 22px 20px 20px; border-bottom: 1px solid rgba(255,255,255,0.06); text-align: center; }
  .sidebar-logo-mark { display: flex; align-items: center; justify-content: center; }
  .logo-img { width: 190px; height: auto; max-height: 62px; object-fit: contain; display: block; }
  .logo-text { font-size: 26px; font-weight: 700; color: #f4f6fb; letter-spacing: 0; margin-top: 12px; line-height: 1; }
  .logo-sub { font-size: 10px; color: #555e78; font-family: var(--mono); letter-spacing: 0.5px; text-transform: uppercase; margin-top: 1px; }

  .sidebar-nav { flex: 1; padding: 12px 10px; overflow-y: auto; }
  .nav-section-label { font-size: 10px; font-family: var(--mono); letter-spacing: 1px; text-transform: uppercase; color: #555e78; padding: 10px 10px 6px; }
  .nav-item { display: flex; align-items: center; gap: 10px; padding: 9px 10px; border-radius: var(--radius); cursor: pointer; color: #8b92a8; font-size: 13px; font-weight: 400; transition: all 0.15s; margin-bottom: 1px; }
  .nav-item:hover { background: rgba(255,255,255,0.07); color: #e8eaf0; }
  .nav-item.active { background: rgba(59,114,217,0.20); color: #7eb3ff; font-weight: 500; }
  .nav-item svg { width: 16px; height: 16px; flex-shrink: 0; }
  .nav-badge { margin-left: auto; background: var(--accent); color: white; font-size: 10px; font-family: var(--mono); padding: 1px 6px; border-radius: 20px; }
  .nav-badge.amber { background: #d97706; }
  .nav-badge.red { background: #dc2626; }

  .sidebar-user { padding: 14px 16px; border-top: 1px solid rgba(255,255,255,0.06); display: flex; align-items: center; gap: 10px; }
  .user-avatar { width: 30px; height: 30px; border-radius: 50%; background: rgba(59,114,217,0.20); border: 1px solid rgba(59,114,217,0.5); display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 600; color: #7eb3ff; flex-shrink: 0; }
  .user-name { font-size: 12px; font-weight: 500; color: #e8eaf0; }
  .user-role { font-size: 10px; color: #555e78; font-family: var(--mono); }
  .role-switch { margin-left: auto; background: rgba(255,255,255,0.08); border: none; color: #8b92a8; font-size: 10px; padding: 3px 8px; border-radius: 4px; cursor: pointer; font-family: var(--mono); }
  .role-switch:hover { color: #e8eaf0; background: rgba(255,255,255,0.14); }

  /* MAIN */
  .main { flex: 1; overflow-y: auto; background: var(--bg); }
  .page-header { padding: 24px 28px 0; display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
  .page-title { font-size: 22px; font-weight: 600; letter-spacing: -0.5px; color: var(--text); }
  .page-sub { font-size: 13px; color: var(--text2); margin-top: 3px; }
  .page-content { padding: 20px 28px 40px; }

  /* BUTTONS */
  .btn { display: inline-flex; align-items: center; gap: 7px; padding: 8px 16px; border-radius: var(--radius); font-size: 13px; font-weight: 500; cursor: pointer; border: none; transition: all 0.15s; font-family: var(--font); }
  .btn-primary { background: var(--accent); color: white; }
  .btn-primary:hover { background: var(--accent2); }
  .btn-ghost { background: transparent; color: var(--text2); border: 1px solid var(--border2); }
  .btn-ghost:hover { background: var(--bg3); color: var(--text); }
  .btn-danger { background: var(--red-soft); color: var(--red); border: 1px solid rgba(248,113,113,0.2); }
  .btn-danger:hover { background: rgba(248,113,113,0.2); }
  .btn-sm { padding: 5px 12px; font-size: 12px; }
  .btn[disabled] { opacity: 0.55; cursor: not-allowed; }
  .btn-icon { padding: 7px; border-radius: var(--radius); background: var(--bg3); border: 1px solid var(--border); color: var(--text2); cursor: pointer; display: inline-flex; align-items: center; justify-content: center; transition: all 0.15s; }
  .btn-icon:hover { background: var(--bg4); color: var(--text); }
  .row-actions { display: flex; flex-direction: column; gap: 6px; align-items: stretch; min-width: 96px; }
  .row-actions .btn { width: 100%; min-height: 32px; justify-content: center; }
  .row-action-hint { font-size: 10px; line-height: 1.25; color: var(--text3); text-align: center; }

  /* CARDS */
  .card { background: var(--bg2); border: 1px solid var(--border); border-radius: var(--radius-lg); }
  .card-header { padding: 16px 20px; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; }
  .card-title { font-size: 14px; font-weight: 600; color: var(--text); }
  .card-body { padding: 20px; }

  /* BADGES */
  .badge { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 500; padding: 3px 9px; border-radius: 20px; font-family: var(--mono); }
  .badge-blue { background: var(--accent-soft); color: var(--accent); }
  .badge-teal { background: var(--teal-soft); color: var(--teal); }
  .badge-amber { background: var(--amber-soft); color: var(--amber); }
  .badge-red { background: var(--red-soft); color: var(--red); }
  .badge-green { background: var(--green-soft); color: var(--green); }
  .badge-purple { background: var(--purple-soft); color: var(--purple); }
  .badge-coral { background: var(--coral-soft); color: var(--coral); }
  .badge-gray { background: rgba(255,255,255,0.05); color: var(--text2); }
  .badge-select { width: auto; border-radius: 20px; padding: 4px 28px 4px 10px; font-family: var(--mono); font-size: 11px; font-weight: 600; }
  .badge-select.badge-amber { border-color: rgba(217,119,6,0.28); }
  .badge-select.badge-green { border-color: rgba(22,163,74,0.28); }
  .badge-select.badge-red { border-color: rgba(220,38,38,0.28); }

  /* TABLES */
  .table-wrap { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 11px; font-family: var(--mono); letter-spacing: 0.5px; text-transform: uppercase; color: var(--text3); padding: 10px 16px; border-bottom: 1px solid var(--border); font-weight: 400; }
  td { padding: 13px 16px; border-bottom: 1px solid var(--border); font-size: 13px; color: var(--text2); vertical-align: middle; }
  tr:last-child td { border-bottom: none; }
  tr:hover td { background: rgba(255,255,255,0.02); }
  td.strong { color: var(--text); font-weight: 500; }

  /* FORMS */
  .form-group { margin-bottom: 16px; }
  .form-label { font-size: 12px; font-weight: 500; color: var(--text2); margin-bottom: 6px; display: block; }
  .form-input, .form-select, .form-textarea { width: 100%; background: var(--bg3); border: 1px solid var(--border2); border-radius: var(--radius); color: var(--text); font-size: 13px; padding: 9px 12px; font-family: var(--font); transition: border 0.15s; outline: none; }
  .form-input:focus, .form-select:focus, .form-textarea:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
  .form-textarea { resize: vertical; min-height: 80px; }
  .form-select option { background: var(--bg3); }
  .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .form-row-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; }

  /* MODAL */
  .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.7); z-index: 100; display: flex; align-items: center; justify-content: center; padding: 20px; }
  .modal { background: var(--bg2); border: 1px solid var(--border2); border-radius: var(--radius-xl); width: 100%; max-width: 580px; max-height: 90vh; overflow-y: auto; box-shadow: var(--shadow); }
  .modal-lg { max-width: 720px; }
  .modal-header { padding: 20px 24px 16px; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; }
  .modal-title { font-size: 16px; font-weight: 600; letter-spacing: -0.3px; }
  .modal-body { padding: 24px; }
  .modal-footer { padding: 16px 24px; border-top: 1px solid var(--border); display: flex; align-items: center; justify-content: flex-end; gap: 10px; }
  .modal-close { background: none; border: none; color: var(--text3); cursor: pointer; font-size: 20px; line-height: 1; padding: 2px; }
  .modal-close:hover { color: var(--text); }

  /* STATS */
  .stat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; }
  .stat-card { background: var(--bg2); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 18px 20px; }
  .stat-label { font-size: 11px; font-family: var(--mono); letter-spacing: 0.5px; text-transform: uppercase; color: var(--text3); margin-bottom: 10px; }
  .stat-value { font-size: 28px; font-weight: 600; letter-spacing: -1px; color: var(--text); }
  .stat-sub { font-size: 12px; color: var(--text3); margin-top: 4px; }
  .stat-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; margin-right: 5px; }

  /* PIPELINE KANBAN */
  .kanban { display: flex; gap: 12px; overflow-x: auto; padding-bottom: 8px; }
  .kanban-col { flex-shrink: 0; width: 220px; background: var(--bg2); border: 1px solid var(--border); border-radius: var(--radius-lg); display: flex; flex-direction: column; }
  .kanban-col-header { padding: 12px 14px; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; }
  .kanban-col-title { font-size: 12px; font-weight: 600; color: var(--text); }
  .kanban-col-count { font-size: 11px; font-family: var(--mono); background: var(--bg4); color: var(--text3); padding: 2px 7px; border-radius: 10px; }
  .kanban-col-body { padding: 10px; display: flex; flex-direction: column; gap: 8px; flex: 1; }
  .kanban-card { background: var(--bg3); border: 1px solid var(--border); border-radius: var(--radius); padding: 12px; cursor: pointer; transition: all 0.15s; }
  .kanban-card:hover { border-color: var(--border2); background: var(--bg4); transform: translateY(-1px); box-shadow: var(--shadow-sm); }
  .kanban-card-name { font-size: 13px; font-weight: 500; color: var(--text); margin-bottom: 4px; }
  .kanban-card-job { font-size: 11px; color: var(--text3); }
  .kanban-card-meta { display: flex; align-items: center; justify-content: space-between; margin-top: 10px; }
  .kanban-card-days { font-size: 10px; font-family: var(--mono); color: var(--text3); }
  .kanban-stage-dot { width: 6px; height: 6px; border-radius: 50%; }

  /* SCORECARD */
  .score-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
  .score-label { font-size: 13px; color: var(--text2); }
  .score-stars { display: flex; gap: 4px; }
  .score-star { width: 28px; height: 28px; border-radius: 6px; background: var(--bg3); border: 1px solid var(--border); display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 12px; transition: all 0.1s; color: var(--text3); }
  .score-star.active { background: var(--amber-soft); border-color: var(--amber); color: var(--amber); }
  .score-star:hover { border-color: var(--amber); color: var(--amber); }

  /* OFFER */
  .offer-steps { display: flex; align-items: center; gap: 0; margin-bottom: 24px; }
  .offer-step { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--text3); }
  .offer-step.active { color: var(--accent); }
  .offer-step.done { color: var(--teal); }
  .offer-step-num { width: 24px; height: 24px; border-radius: 50%; border: 1px solid currentColor; display: flex; align-items: center; justify-content: center; font-size: 10px; font-family: var(--mono); flex-shrink: 0; }
  .offer-step-done-icon { width: 24px; height: 24px; border-radius: 50%; background: var(--teal-soft); border: 1px solid var(--teal); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .offer-connector { flex: 1; height: 1px; background: var(--border); margin: 0 8px; }

  /* TABS */
  .tabs { display: flex; gap: 2px; background: var(--bg2); border: 1px solid var(--border); border-radius: var(--radius); padding: 3px; width: fit-content; }
  .tab { padding: 6px 16px; border-radius: 6px; font-size: 13px; color: var(--text2); cursor: pointer; transition: all 0.15s; }
  .tab.active { background: var(--bg4); color: var(--text); font-weight: 500; }
  .tab:hover:not(.active) { color: var(--text); }

  /* SEARCH + FILTER */
  .toolbar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .toolbar-summary { margin-left: auto; display: flex; align-items: center; justify-content: flex-end; min-width: 140px; }
  .toolbar-count { border: 1px solid var(--border); background: var(--bg2); border-radius: var(--radius); padding: 8px 12px; text-align: right; }
  .toolbar-count-value { font-size: 20px; line-height: 1; font-weight: 700; color: var(--text); }
  .toolbar-count-label { margin-top: 4px; font-size: 10px; font-family: var(--mono); text-transform: uppercase; color: var(--text3); letter-spacing: .5px; }
  .search-wrap { position: relative; }
  .search-icon { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: var(--text3); }
  .search-input { background: var(--bg2); border: 1px solid var(--border2); border-radius: var(--radius); color: var(--text); font-size: 13px; padding: 8px 12px 8px 34px; font-family: var(--font); outline: none; width: 220px; }
  .search-input:focus { border-color: var(--accent); }
  .search-input::placeholder { color: var(--text3); }

  /* MISC */
  .divider { height: 1px; background: var(--border); margin: 20px 0; }
  .empty-state { text-align: center; padding: 60px 20px; color: var(--text3); }
  .empty-state-icon { font-size: 36px; margin-bottom: 12px; }
  .empty-state-text { font-size: 14px; }
  .tag { display: inline-flex; align-items: center; font-size: 11px; font-family: var(--mono); background: var(--bg4); color: var(--text2); padding: 3px 8px; border-radius: 4px; }
  .dot { width: 7px; height: 7px; border-radius: 50%; display: inline-block; }
  .dot-green { background: var(--green); }
  .dot-amber { background: var(--amber); }
  .dot-red { background: var(--red); }
  .dot-blue { background: var(--accent); }
  .dot-gray { background: var(--text3); }
  .activity-item { display: flex; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--border); }
  .activity-item:last-child { border-bottom: none; }
  .activity-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--accent); margin-top: 5px; flex-shrink: 0; }
  .activity-text { font-size: 12px; color: var(--text2); }
  .activity-time { font-size: 11px; color: var(--text3); margin-top: 2px; font-family: var(--mono); }
  .mini-bar { height: 6px; border-radius: 3px; background: var(--bg4); overflow: hidden; margin-top: 6px; }
  .mini-bar-fill { height: 100%; border-radius: 3px; transition: width 0.4s; }
  .source-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
  .source-name { font-size: 12px; color: var(--text2); }
  .source-count { font-size: 12px; font-family: var(--mono); color: var(--text3); }
  .chip { display: inline-flex; align-items: center; gap: 5px; background: var(--bg3); border: 1px solid var(--border); border-radius: 20px; padding: 3px 10px; font-size: 11px; color: var(--text2); }
  .chip-remove { background: none; border: none; color: var(--text3); cursor: pointer; font-size: 14px; line-height: 1; display: flex; align-items: center; }
  .btn-reset { appearance: none; border: 0; background: transparent; color: inherit; font: inherit; text-align: inherit; cursor: pointer; }
  .btn-reset:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; border-radius: var(--radius); }

  .alert { padding: 12px 16px; border-radius: var(--radius); font-size: 13px; display: flex; gap: 10px; align-items: flex-start; }
  .alert-info { background: var(--accent-soft); border: 1px solid rgba(79,142,247,0.2); color: var(--accent); }
  .alert-amber { background: var(--amber-soft); border: 1px solid rgba(245,158,11,0.2); color: var(--amber); }
  .alert-green { background: var(--green-soft); border: 1px solid rgba(74,222,128,0.2); color: var(--green); }
  .candidate-avatar { width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 600; flex-shrink: 0; }
  .stage-progress { display: flex; align-items: center; gap: 3px; }
  .stage-pip { height: 4px; border-radius: 2px; flex: 1; background: var(--bg4); }
  .stage-pip.filled { background: var(--accent); }
  .stage-pip.current { background: var(--amber); }
  .insight-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }
  .insight-card { background: var(--bg3); border: 1px solid var(--border); border-radius: var(--radius); padding: 14px; }
  .insight-card.clickable { cursor: pointer; transition: border-color 0.15s, box-shadow 0.15s, transform 0.15s; }
  .insight-card.clickable:hover { border-color: var(--accent); box-shadow: var(--shadow-sm); transform: translateY(-1px); }
  .insight-card.clickable:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .insight-label { font-size: 10px; font-family: var(--mono); text-transform: uppercase; color: var(--text3); letter-spacing: 0.5px; margin-bottom: 6px; }
  .insight-value { font-size: 22px; font-weight: 600; color: var(--text); letter-spacing: -0.5px; }
  .insight-copy { font-size: 12px; color: var(--text2); margin-top: 6px; }
  .compact-list { display: grid; gap: 8px; }
  .compact-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 0; border-bottom: 1px solid var(--border); }
  .compact-row:last-child { border-bottom: none; }
  .dashboard-work-grid { display: grid; grid-template-columns: 1.1fr 1fr 1fr; gap: 16px; margin-top: 16px; }
  .dashboard-breakdown-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 16px; }
  .template-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }
  .template-card { background: var(--bg3); border: 1px solid var(--border); border-radius: var(--radius); padding: 14px; }
  .roadmap-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px; }
  .roadmap-card { background: var(--bg2); border: 1px solid var(--border); border-radius: var(--radius); padding: 14px; }
  .readiness-bar { height: 8px; background: var(--bg4); border-radius: 999px; overflow: hidden; margin-top: 8px; }
  .readiness-bar-fill { height: 100%; background: var(--teal); border-radius: 999px; }
  .dashboard-stack { display: grid; gap: 18px; }
  .dashboard-section { background: var(--bg2); border: 1px solid var(--border); border-radius: var(--radius-lg); overflow: hidden; }
  .dashboard-section-head { padding: 16px 20px; border-bottom: 1px solid var(--border); display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
  .dashboard-section-title { font-size: 15px; font-weight: 700; color: var(--text); letter-spacing: 0; }
  .dashboard-section-sub { font-size: 12px; color: var(--text3); margin-top: 3px; }
  .dashboard-section-body { padding: 18px 20px; }
  .achievement-chart { display: grid; gap: 14px; }
  .achievement-row { display: grid; gap: 8px; }
  .achievement-row-top { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
  .achievement-dept { font-size: 13px; font-weight: 700; color: var(--text); }
  .achievement-summary { font-size: 12px; color: var(--text2); text-align: right; }
  .achievement-track { height: 12px; background: var(--bg4); border-radius: 999px; overflow: hidden; }
  .achievement-fill { height: 100%; border-radius: 999px; min-width: 3px; transition: width 0.25s; }
  .achievement-fill.achievement-green { background: var(--green); }
  .achievement-fill.achievement-yellow { background: var(--amber); }
  .achievement-fill.achievement-red { background: var(--red); }
  .achievement-row-meta { display: flex; align-items: center; justify-content: space-between; gap: 12px; font-size: 11px; color: var(--text3); }
  .achievement-status { display: inline-flex; align-items: center; gap: 6px; font-family: var(--mono); text-transform: uppercase; letter-spacing: .4px; }
  .chart-dashboard-grid { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 16px; }
  .chart-card { grid-column: span 4; background: var(--bg2); border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm); padding: 18px; min-width: 0; overflow: hidden; }
  .chart-card-wide { grid-column: span 8; }
  .chart-card-full { grid-column: 1 / -1; }
  .chart-card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
  .chart-card-title { font-size: 15px; font-weight: 700; color: var(--text); letter-spacing: 0; }
  .chart-card-sub { font-size: 12px; color: var(--text3); margin-top: 4px; line-height: 1.35; }
  .chart-metric-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0; border-bottom: 1px solid var(--border); padding-bottom: 16px; margin-bottom: 16px; }
  .chart-metric-grid-secondary { grid-template-columns: repeat(2, minmax(0, 1fr)); border-bottom: 0; padding-bottom: 0; margin-bottom: 0; }
  .chart-metric { text-align: center; padding: 4px 12px; border-right: 1px solid var(--border); min-width: 0; }
  .chart-metric:last-child { border-right: 0; }
  .chart-metric-value { font-size: 30px; line-height: 1; font-weight: 800; letter-spacing: 0; color: var(--text); }
  .chart-metric-label { font-size: 11px; color: var(--text2); margin-top: 6px; line-height: 1.3; }
  .chart-metric-breakdown { font-size: 10px; color: var(--text3); margin-top: 4px; line-height: 1.25; }
  .chart-hero-number { text-align: center; padding: 8px 0 2px; }
  .chart-hero-value { font-size: 32px; line-height: 1; font-weight: 800; color: var(--text); }
  .chart-hero-label { color: var(--text2); font-size: 12px; margin-top: 6px; }
  .donut-wrap { display: grid; justify-items: center; gap: 12px; }
  .donut-chart { width: 172px; aspect-ratio: 1; border-radius: 50%; display: grid; place-items: center; box-shadow: inset 0 0 0 1px rgba(15, 23, 42, .04); }
  .donut-center { width: 110px; aspect-ratio: 1; border-radius: 50%; background: var(--bg2); display: grid; place-items: center; text-align: center; box-shadow: 0 0 0 1px var(--border); }
  .donut-value { font-size: 30px; line-height: 1; font-weight: 800; color: var(--text); }
  .donut-label { font-size: 11px; color: var(--text3); margin-top: 4px; }
  .chart-legend { display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; color: var(--text3); font-size: 11px; }
  .chart-legend span { display: inline-flex; align-items: center; gap: 6px; }
  .pie-chart-svg { width: 190px; aspect-ratio: 1; display: block; margin: 4px auto 12px; overflow: visible; }
  .pie-slice { filter: drop-shadow(0 1px 1px rgba(15, 23, 42, .08)); }
  .pie-label { fill: #fff; font-size: 12px; font-weight: 800; text-anchor: middle; dominant-baseline: middle; paint-order: stroke; stroke: rgba(15, 23, 42, .28); stroke-width: 3px; stroke-linejoin: round; }
  .chart-bars { display: grid; gap: 13px; }
  .chart-bar-row { display: grid; gap: 7px; }
  .chart-bar-top { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
  .chart-bar-label { font-size: 13px; font-weight: 700; color: var(--text); }
  .chart-bar-value { font-size: 12px; color: var(--text2); text-align: right; }
  .chart-bar-track { height: 12px; border-radius: 999px; background: var(--bg4); overflow: hidden; }
  .chart-bar-fill { height: 100%; border-radius: 999px; background: var(--green); min-width: 3px; }
  .chart-bar-meta { display: flex; justify-content: space-between; gap: 12px; color: var(--text3); font-size: 11px; }
  .plan-achievement-card { background: #fffefa; }
  .plan-achievement-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; margin-bottom: 18px; }
  .plan-achievement-title { font-size: 18px; font-weight: 800; color: var(--text); letter-spacing: 0; }
  .plan-achievement-sub { font-size: 13px; color: var(--text2); margin-top: 4px; }
  .plan-legend { display: flex; align-items: center; gap: 18px; color: var(--text2); font-size: 13px; white-space: nowrap; }
  .plan-legend span { display: inline-flex; align-items: center; gap: 7px; }
  .plan-legend-box { width: 13px; height: 13px; border-radius: 3px; display: inline-block; }
  .plan-legend-planned { background: #bfe38b; border: 1px solid #87bf4a; }
  .plan-legend-filled { background: #3f7f08; }
  .plan-summary-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; margin-bottom: 26px; }
  .plan-summary-card { background: #f5f3ea; border-radius: 8px; padding: 16px 12px; text-align: center; border: 1px solid rgba(15, 23, 42, .04); }
  .plan-summary-label { color: #3f3f3f; font-size: 13px; }
  .plan-summary-value { margin-top: 6px; color: #111827; font-size: 28px; line-height: 1; font-weight: 800; letter-spacing: 0; }
  .plan-summary-value.open { color: #6b5a13; }
  .plan-summary-value.percent { color: #8b2f2f; }
  .plan-bars-plot { display: grid; gap: 12px; padding: 4px 0 8px; }
  .plan-plot-row { display: grid; grid-template-columns: 185px minmax(260px, 1fr); gap: 16px; align-items: center; }
  .plan-plot-label { text-align: right; font-size: 13px; font-weight: 700; color: #3f3f3f; line-height: 1.2; }
  .plan-plot-area { position: relative; min-height: 44px; border-left: 1px solid #d9d9d9; background-image: repeating-linear-gradient(to right, transparent 0, transparent calc(12.5% - 1px), #e6e2da calc(12.5% - 1px), #e6e2da 12.5%); }
  .plan-bar { position: absolute; left: 0; border-radius: 5px; transition: width .25s; }
  .plan-bar.planned { top: 5px; height: 18px; background: #bfe38b; border: 1px solid #87bf4a; }
  .plan-bar.filled { top: 27px; height: 14px; background: #3f7f08; box-shadow: inset 0 -1px 0 rgba(0,0,0,.12); }
  .plan-bar-note { position: absolute; right: 0; top: -1px; font-size: 11px; color: var(--text3); background: rgba(255, 254, 250, .84); padding-left: 6px; }
  .plan-axis { display: grid; grid-template-columns: 185px minmax(260px, 1fr); gap: 16px; align-items: start; margin-top: 3px; }
  .plan-axis-scale { display: flex; justify-content: space-between; border-top: 1px solid #d9d9d9; color: #555; font-size: 12px; padding-top: 6px; }
  .plan-axis-label { grid-column: 2; text-align: center; color: #555; font-size: 12px; margin-top: 2px; }
  .funnel-stack { display: grid; gap: 11px; }
  .funnel-stack-row { display: grid; grid-template-columns: 155px 1fr 54px; gap: 12px; align-items: center; }
  .funnel-stack-stage { font-size: 12px; font-weight: 700; color: var(--text); }
  .funnel-stack-track { height: 12px; border-radius: 999px; background: var(--bg4); overflow: hidden; }
  .funnel-stack-fill { height: 100%; border-radius: 999px; background: var(--accent); }
  .funnel-stack-count { font-size: 12px; font-family: var(--mono); color: var(--text2); text-align: right; }
  .health-grid { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 12px; }
  .health-card { border: 1px solid var(--border); border-radius: var(--radius); padding: 14px; background: var(--bg2); min-width: 0; }
  .health-card.clickable { cursor: pointer; transition: border-color 0.15s, box-shadow 0.15s, transform 0.15s; }
  .health-card.clickable:hover { border-color: var(--accent); box-shadow: var(--shadow-sm); transform: translateY(-1px); }
  .health-card.clickable:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .health-card-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 12px; }
  .health-label { font-size: 11px; font-family: var(--mono); text-transform: uppercase; color: var(--text3); letter-spacing: .4px; line-height: 1.35; }
  .health-value { font-size: 26px; line-height: 1; font-weight: 700; color: var(--text); letter-spacing: 0; }
  .health-note { font-size: 11px; color: var(--text3); margin-top: 8px; line-height: 1.35; }
  .health-action { font-size: 12px; color: var(--text2); margin-top: 10px; line-height: 1.35; }
  .health-pill { display: inline-flex; align-items: center; gap: 5px; font-size: 10px; font-family: var(--mono); color: var(--text2); white-space: nowrap; }
  .health-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .health-green { background: var(--green); }
  .health-yellow { background: var(--amber); }
  .health-red { background: var(--red); }
  .health-legend { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-top: 14px; color: var(--text3); font-size: 11px; }
  .health-legend span { display: inline-flex; align-items: center; gap: 6px; }
  .funnel-list { display: grid; gap: 11px; }
  .funnel-row { display: grid; grid-template-columns: 170px 1fr 70px; gap: 12px; align-items: center; }
  .funnel-stage { font-size: 13px; font-weight: 600; color: var(--text); }
  .funnel-bar { height: 10px; background: var(--bg4); border-radius: 999px; overflow: hidden; }
  .funnel-fill { height: 100%; border-radius: 999px; background: var(--accent); }
  .funnel-count { font-size: 12px; font-family: var(--mono); color: var(--text2); text-align: right; }
  .table-compact th, .table-compact td { padding: 11px 14px; }
  .progress-cell { min-width: 130px; }
  .progress-track { height: 7px; background: var(--bg4); border-radius: 999px; overflow: hidden; margin-top: 5px; }
  .progress-fill { height: 100%; background: var(--teal); border-radius: 999px; }
  .empty-panel { padding: 28px 18px; text-align: center; color: var(--text3); font-size: 13px; line-height: 1.5; }
  @media (max-width: 1180px) {
    .health-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .chart-card, .chart-card-wide { grid-column: span 6; }
  }
  @media (max-width: 760px) {
    .page-header { flex-direction: column; align-items: stretch; }
    .stat-grid { grid-template-columns: 1fr; }
    .dashboard-section-head { flex-direction: column; align-items: stretch; }
    .health-grid { grid-template-columns: 1fr; }
    .funnel-row { grid-template-columns: 1fr; gap: 6px; }
    .funnel-count { text-align: left; }
    .chart-dashboard-grid { grid-template-columns: 1fr; }
    .chart-card, .chart-card-wide, .chart-card-full { grid-column: 1; }
    .chart-metric-grid { grid-template-columns: 1fr; gap: 12px; }
    .chart-metric { border-right: 0; border-bottom: 1px solid var(--border); padding-bottom: 12px; }
    .chart-metric:last-child { border-bottom: 0; }
    .plan-achievement-head { flex-direction: column; }
    .plan-summary-grid { grid-template-columns: 1fr 1fr; gap: 10px; }
    .plan-plot-row, .plan-axis { grid-template-columns: 100px minmax(160px, 1fr); gap: 10px; }
    .plan-plot-label { font-size: 12px; }
    .plan-axis-label { grid-column: 2; }
    .funnel-stack-row { grid-template-columns: 1fr; gap: 6px; }
    .funnel-stack-count { text-align: left; }
    .insight-grid, .template-grid, .roadmap-grid, .dashboard-work-grid, .dashboard-breakdown-grid { grid-template-columns: 1fr; }
    .toolbar { align-items: stretch; }
    .toolbar-summary { margin-left: 0; justify-content: stretch; }
    .toolbar-count { width: 100%; text-align: left; }
    .toolbar > div, .toolbar .form-select, .search-input { width: 100% !important; }
  }
`;

// ── MOCK DATA ──────────────────────────────────────────────────────────────────
const STAGES = ["Applied","HR Screening","HM Review","1st Interview","Technical Interview","Final Interview","Offer","Hired","Rejected","On Hold"];
const PIPELINE_STAGES = STAGES.slice(0, 7);

// Real Karm team
const TEAM = [
  { email: "islam.ahmed@karmsolar.com",     fullName: "Islam Ahmed",     initials: "IA", color: "#4f8ef7", role: "Recruiter", department: "HR", accessScope: "All recruitment data", active: true, canViewSalary: true, canApproveOffers: false, canApproveRequisitions: false },
  { email: "mohi.mohsen@karmsolar.com",     fullName: "Mohi Mohsen",     initials: "MM", color: "#2dd4b4", role: "Hiring Manager", department: "O&M Office", accessScope: "Assigned jobs", active: true, canViewSalary: false, canApproveOffers: false, canApproveRequisitions: true },
  { email: "samia.salaheldin@karmsolar.com",fullName: "Samia Salaheldin",initials: "SS", color: "#a78bfa", role: "Admin", department: "HR", accessScope: "All system data", active: true, canViewSalary: true, canApproveOffers: true, canApproveRequisitions: true },
  { email: "ahmed.farid@karmsolar.com",     fullName: "Ahmed Farid",     initials: "AF", color: "#fb923c", role: "Interviewer", department: "Technical Office", accessScope: "Assigned interviews", active: true, canViewSalary: false, canApproveOffers: false, canApproveRequisitions: false },
  { email: "aya.osman@karmsolar.com",       fullName: "Aya Osman",       initials: "AO", color: "#f87171", role: "Hiring Manager", department: "Finance", accessScope: "Assigned jobs", active: true, canViewSalary: false, canApproveOffers: false, canApproveRequisitions: true },
  { email: "heba.selim@karmsolar.com",      fullName: "Heba Selim",      initials: "HS", color: "#4ade80", role: "Interviewer", department: "HR", accessScope: "Assigned interviews", active: true, canViewSalary: false, canApproveOffers: false, canApproveRequisitions: false },
  { email: "hussien.magdy@karmsolar.com",   fullName: "Hussien Magdy",   initials: "HM", color: "#f59e0b", role: "Hiring Manager", department: "Procurement", accessScope: "Assigned jobs", active: true, canViewSalary: false, canApproveOffers: true, canApproveRequisitions: true },
  { email: "nada.khamis@karmsolar.com",     fullName: "Nada Khamis",     initials: "NK", color: "#38bdf8", role: "Recruiter", department: "HR", accessScope: "Assigned recruitment data", active: true, canViewSalary: false, canApproveOffers: false, canApproveRequisitions: false },
  { email: "omar.elsheemy@karmsolar.com",   fullName: "Omar El-Sheemy",  initials: "OE", color: "#e879f9", role: "Interviewer", department: "Business Development", accessScope: "Assigned interviews", active: true, canViewSalary: false, canApproveOffers: false, canApproveRequisitions: false },
  { email: "yara.rashad@karmsolar.com",     fullName: "Yara Rashad",     initials: "YR", color: "#34d399", role: "Admin", department: "HR", accessScope: "All system data", active: true, canViewSalary: true, canApproveOffers: true, canApproveRequisitions: true },
  { email: "ahmed.zahran@karmsolar.com",    fullName: "Ahmed Zahran",    initials: "AZ", color: "#60a5fa", role: "Admin", department: "Management", accessScope: "All system data", active: true, canViewSalary: true, canApproveOffers: true, canApproveRequisitions: true },
];

// ── ROLE PERMISSIONS MAP ──────────────────────────────────────────────────────
const ROLE_PERMISSIONS = {
  "Admin":          { canSeeAll: true,  canApproveOffer: true,  canApproveRequisition: true,  canManageUsers: true,  canMoveCandidates: true,  canCreateRequisitions: true,  canEditCandidates: true,  canScheduleInterviews: true,  canCreateOffers: true,  canDeleteRecords: true,  canViewSalary: true  },
  "Recruiter":      { canSeeAll: true,  canApproveOffer: false, canApproveRequisition: false, canManageUsers: false, canMoveCandidates: true,  canCreateRequisitions: true,  canEditCandidates: true,  canScheduleInterviews: true,  canCreateOffers: true,  canDeleteRecords: false, canViewSalary: false },
  "Hiring Manager": { canSeeAll: false, canApproveOffer: false, canApproveRequisition: true,  canManageUsers: false, canMoveCandidates: false, canCreateRequisitions: false, canEditCandidates: false, canScheduleInterviews: false, canCreateOffers: false, canDeleteRecords: false, canViewSalary: false },
  "Interviewer":    { canSeeAll: false, canApproveOffer: false, canApproveRequisition: false, canManageUsers: false, canMoveCandidates: false, canCreateRequisitions: false, canEditCandidates: false, canScheduleInterviews: false, canCreateOffers: false, canDeleteRecords: false, canViewSalary: false },
};
const ROLE_LIST = Object.keys(ROLE_PERMISSIONS);
const DEFAULT_ROLE_ASSIGNMENTS = {
  "Admin": [9, 10, 2],
  "Recruiter": [0, 7],
  "Hiring Manager": [1, 4, 6],
  "Interviewer": [3, 5, 8],
};

const normalizeRoleAssignments = (assignments) => {
  const legacy = assignments || {};
  return ROLE_LIST.reduce((acc, role) => {
    const raw = legacy[role];
    const values = Array.isArray(raw) ? raw : Number.isInteger(raw) ? [raw] : DEFAULT_ROLE_ASSIGNMENTS[role];
    const valid = values.filter(idx => Number.isInteger(idx) && TEAM[idx]);
    acc[role] = valid.length ? Array.from(new Set(valid)) : DEFAULT_ROLE_ASSIGNMENTS[role];
    return acc;
  }, {});
};

const ENTITIES = ["HoldCo. (UK)", "Sub HoldCo. (NL)", "Karm Egypt", "Karm Cyprus", "Karm Tunisia"];
const DEPARTMENTS = [
  "CEO Office",
  "Innovation Center",
  "Logistics",
  "Finance",
  "HR",
  "Generation",
  "O&M Office",
  "Business Development",
  "Investment",
  "KB - Construction",
  "Management",
  "Distribution",
  "KB - KAL",
  "Procurement",
  "Technical Office",
  "Compliance",
  "Digital Transformation",
  "Legal Affairs",
  "Operations",
  "HSE",
  "Sand",
  "Facility Management",
];
const JOB_FAMILIES = [
  "Top Management",
  "Middle Management",
  "Staff",
  "Blue Collar - Technicians",
];

const SOURCES = ["LinkedIn", "Forasna", "Career Email", "Referral", "Internal Transfer"];
const SAMPLE_CV_URL = "./assets/sample-cv.pdf";

const formatDisplayDate = (value) => {
  if (!value) return "—";
  const normalized = String(value).replace(" ", "T");
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};

const initJobs = [
  { id: 1, title: "Senior Solar Engineer", dept: "Technical Office", entity: "Karm Egypt", positionType: "Manpower", status: "Open", level: "Staff", headcount: 2, openDate: "2025-04-01", recruiter: "Islam Ahmed", hiringManager: "Mohi Mohsen", description: "Lead technical solar system design.", salaryMin: 35000, salaryMax: 50000, approvedBy: "Samia Salaheldin", approvalDate: "2025-03-28" },
  { id: 2, title: "Business Development Manager", dept: "Business Development", entity: "Karm Cyprus", positionType: "Additional R.", status: "Open", level: "Middle Management", headcount: 1, openDate: "2025-03-15", recruiter: "Islam Ahmed", hiringManager: "Yara Rashad", description: "Drive commercial partnerships.", salaryMin: 45000, salaryMax: 65000, approvedBy: "Ahmed Zahran", approvalDate: "2025-03-12" },
  { id: 3, title: "O&M Technician", dept: "O&M Office", entity: "Karm Egypt", positionType: "Manpower", status: "Open", level: "Blue Collar - Technicians", headcount: 3, openDate: "2025-04-10", recruiter: "Islam Ahmed", hiringManager: "Mohi Mohsen", description: "Maintain solar installations.", salaryMin: 8000, salaryMax: 14000, approvedBy: "Samia Salaheldin", approvalDate: "2025-04-07" },
  { id: 4, title: "Financial Controller", dept: "Finance", entity: "Sub HoldCo. (NL)", positionType: "Replacement", status: "Draft", level: "Middle Management", headcount: 1, openDate: "2025-04-20", recruiter: "Islam Ahmed", hiringManager: "Yara Rashad", description: "Oversee financial operations.", salaryMin: 40000, salaryMax: 55000, approvedBy: "Pending", approvalDate: "" },
  { id: 5, title: "HR Supervisor", dept: "HR", entity: "Karm Egypt", positionType: "Manpower", status: "Closed", level: "Staff", headcount: 1, openDate: "2025-02-01", recruiter: "Islam Ahmed", hiringManager: "Yara Rashad", description: "Support HR operations.", salaryMin: 18000, salaryMax: 26000, approvedBy: "Samia Salaheldin", approvalDate: "2025-01-28" },
];

const initCandidates = [
  { id: 1, name: "Ahmed Kamel", email: "a.kamel@gmail.com", phone: "+20 100 111 2233", nationality: "Egyptian", source: "LinkedIn", cvUrl: SAMPLE_CV_URL, cvFileName: "Ahmed_Kamel_CV.pdf", addedDate: "2025-04-05", tags: ["solar", "engineer"], color: "#4f8ef7", notesLog: [{ id: 1, owner: "Yara Rashad", date: "2026-05-11", text: "Strong technical profile but communication needs assessment during interview." }] },
  { id: 2, name: "Sara El-Sayed", email: "sara.elsayed@outlook.com", phone: "+20 112 333 4455", nationality: "Egyptian", source: "Referral", referredBy: "Mohi Mohsen", cvUrl: SAMPLE_CV_URL, cvFileName: "Sara_ElSayed_CV.pdf", addedDate: "2025-03-20", tags: ["business", "commercial"], color: "#2dd4b4", notesLog: [{ id: 2, owner: "Islam Ahmed", date: "2026-05-10", text: "Commercial background is strong. Confirm compensation expectations before offer approval." }] },
  { id: 3, name: "Omar Hassan", email: "o.hassan@proton.me", phone: "+20 101 555 6677", nationality: "Egyptian", source: "Wuzzuf", cvUrl: "#", addedDate: "2025-04-12", tags: ["technician", "o&m"], color: "#a78bfa" },
  { id: 4, name: "Nadia Ibrahim", email: "nadia.ibrahim@gmail.com", phone: "+20 100 777 8899", nationality: "Egyptian", source: "Headhunt", cvUrl: "#", addedDate: "2025-04-08", tags: ["finance", "controller"], color: "#f59e0b" },
  { id: 5, name: "Khaled Mostafa", email: "k.mostafa@yahoo.com", phone: "+20 112 999 0011", nationality: "Egyptian", source: "LinkedIn", cvUrl: "#", addedDate: "2025-04-15", tags: ["solar", "senior"], color: "#fb923c" },
  { id: 6, name: "Laila Farouk", email: "laila.f@gmail.com", phone: "+20 100 222 3344", nationality: "Egyptian", source: "Direct Application", cvUrl: "#", addedDate: "2025-04-02", tags: ["commercial", "bd"], color: "#f87171" },
  { id: 7, name: "Youssef Tawfik", email: "y.tawfik@outlook.com", phone: "+20 101 444 5566", nationality: "Egyptian", source: "Referral", referredBy: "Heba Selim", cvUrl: "#", addedDate: "2025-04-18", tags: ["o&m", "maintenance"], color: "#4ade80" },
];

const initApplications = [
  { id: 1, candidateId: 1, jobId: 1, stage: "Technical Interview", status: "Active", recruiter: "Islam Ahmed", appliedDate: "2025-04-05", notes: "Strong technical background, 5 yrs exp", daysInStage: 3, priority: "Top candidate", nextAction: "Schedule technical interview", lastActivityAt: "2026-05-09" },
  { id: 2, candidateId: 2, jobId: 2, stage: "Final Interview", status: "Active", recruiter: "Islam Ahmed", appliedDate: "2025-03-20", notes: "Excellent communication skills", daysInStage: 1, priority: "Urgent", nextAction: "Prepare offer approval", lastActivityAt: "2026-05-10" },
  { id: 3, candidateId: 3, jobId: 3, stage: "HR Screening", status: "Active", recruiter: "Islam Ahmed", appliedDate: "2025-04-12", notes: "Good technical fit", daysInStage: 2, priority: "Backup", nextAction: "Complete HR screening", lastActivityAt: "2026-05-09" },
  { id: 4, candidateId: 4, jobId: 2, stage: "1st Interview", status: "Active", recruiter: "Islam Ahmed", appliedDate: "2025-04-08", notes: "CFA qualified", daysInStage: 5, priority: "Urgent", nextAction: "Await HM feedback", lastActivityAt: "2026-05-06" },
  { id: 5, candidateId: 5, jobId: 1, stage: "HM Review", status: "Active", recruiter: "Islam Ahmed", appliedDate: "2025-04-15", notes: "Promising profile", daysInStage: 2, priority: "Top candidate", nextAction: "HM review decision", lastActivityAt: "2026-05-09" },
  { id: 6, candidateId: 6, jobId: 2, stage: "Applied", status: "Active", recruiter: "Islam Ahmed", appliedDate: "2025-04-18", notes: "", daysInStage: 1, priority: "Backup", nextAction: "Review CV", lastActivityAt: "2026-05-10" },
  { id: 7, candidateId: 7, jobId: 3, stage: "Applied", status: "Active", recruiter: "Islam Ahmed", appliedDate: "2025-04-18", notes: "", daysInStage: 1, priority: "Backup", nextAction: "Review CV", lastActivityAt: "2026-05-10" },
];

const initScorecards = [
  { id: 1, applicationId: 1, interviewerId: "Mohi Mohsen", interviewType: "Technical Interview", knowledge: 5, attitude: 4, feedback: 4, recommendation: "Hire", notes: "Excellent technical depth. Strong on PV system design.", submittedDate: "2025-04-18" },
  { id: 2, applicationId: 2, interviewerId: "Yara Rashad", interviewType: "Final Interview", knowledge: 4, attitude: 5, feedback: 5, recommendation: "Hire", notes: "Great culture fit, very articulate.", submittedDate: "2025-04-19" },
];

const initOffers = [
  { id: 1, applicationId: 2, salary: 58000, basicSalary: 48000, variablePay: 10000, currency: "EGP", startDate: "2025-06-01", status: "Pending Approval", candidateStatus: "Pending candidate", createdBy: "Heba Selim", approvalNote: "Within approved BDM salary band.", createdDate: "2025-04-20" },
];

const initHiringRequests = [
  { id: 1, title: "Procurement Specialist", dept: "Procurement", entity: "Karm Egypt", requestedBy: "Mohi Mohsen", reason: "Additional workload from Q3 projects", status: "Pending HR Approval", managerApproved: true, hrApproved: false, ceoApproved: false, requestDate: "2025-04-21" },
  { id: 2, title: "Finance Analyst", dept: "Finance", entity: "Sub HoldCo. (NL)", requestedBy: "Yara Rashad", reason: "Replacement for resigned employee", status: "Pending Admin Approval", managerApproved: true, hrApproved: true, ceoApproved: false, requestDate: "2025-04-18" },
];

const initInterviews = [
  { id: 1, applicationId: 1, type: "Technical Interview", scheduledAt: "2025-04-22 10:00", format: "In-person", interviewerId: "Ahmed Farid", status: "Scheduled" },
  { id: 2, applicationId: 2, type: "Final Interview", scheduledAt: "2025-04-21 14:00", format: "Video call", interviewerId: "Yara Rashad", status: "Completed" },
  { id: 3, applicationId: 4, type: "1st Interview", scheduledAt: "2025-04-23 11:00", format: "In-person", interviewerId: "Mohi Mohsen", status: "Scheduled" },
];

// ── ICONS (inline SVG) ────────────────────────────────────────────────────────
const Icon = ({ name, size = 16 }) => {
  const icons = {
    dashboard: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>,
    jobs: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><line x1="12" y1="12" x2="12" y2="16"/><line x1="10" y1="14" x2="14" y2="14"/></svg>,
    candidates: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
    pipeline: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="5" height="18" rx="1"/><rect x="10" y="3" width="5" height="12" rx="1"/><rect x="17" y="3" width="5" height="8" rx="1"/></svg>,
    interviews: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
    offers: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="12" y2="17"/></svg>,
    settings: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
    plus: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
    search: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
    x: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
    check: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
    arrow: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>,
    edit: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
    trash: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>,
    user: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
    mail: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>,
    clock: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
    chevron: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>,
    filter: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>,
    download: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
    alert: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
    star: "⭐",
  };
  return icons[name] || null;
};

// ── STAGE BADGE COLORS ────────────────────────────────────────────────────────
const stageBadge = (stage) => {
  const map = {
    "Applied": "badge-gray",
    "HR Screening": "badge-blue",
    "HM Review": "badge-purple",
    "1st Interview": "badge-teal",
    "Technical Interview": "badge-teal",
    "Final Interview": "badge-coral",
    "Offer": "badge-amber",
    "Hired": "badge-green",
    "Rejected": "badge-red",
    "On Hold": "badge-gray",
  };
  return map[stage] || "badge-gray";
};

const stageColor = (stage) => {
  const map = {
    "Applied": "#555e78",
    "HR Screening": "#4f8ef7",
    "HM Review": "#a78bfa",
    "1st Interview": "#2dd4b4",
    "Technical Interview": "#2dd4b4",
    "Final Interview": "#fb923c",
    "Offer": "#f59e0b",
    "Hired": "#4ade80",
    "Rejected": "#f87171",
    "On Hold": "#555e78",
  };
  return map[stage] || "#555e78";
};

const jobStatusBadge = (s) => s === "Open" ? "badge-green" : s === "Draft" ? "badge-amber" : "badge-gray";

const POSITION_TYPES = ["Manpower", "Additional R.", "Replacement", "Project Hire"];

const positionTypeBadge = (t) => {
  if (t === "Additional R.") return "badge-coral";
  if (t === "Replacement") return "badge-amber";
  if (t === "Project Hire") return "badge-purple";
  return "badge-blue";
};

// ── HELPERS ───────────────────────────────────────────────────────────────────
const initials = (name) => name.split(" ").map(w => w[0]).join("").slice(0,2).toUpperCase();

const stageIndex = (stage) => PIPELINE_STAGES.indexOf(stage);
const todayISO = () => new Date().toISOString().split("T")[0];
const PRIORITY_TAGS = [
  { value: "", label: "No priority", color: "var(--text3)", bg: "var(--bg4)" },
  { value: "Top candidate", label: "Top candidate", color: "var(--amber)", bg: "var(--amber-soft)" },
  { value: "Urgent", label: "Urgent", color: "var(--red)", bg: "var(--red-soft)" },
  { value: "Backup", label: "Backup", color: "var(--amber)", bg: "rgba(217,119,6,0.08)" },
];

const getPriorityTag = (value) => PRIORITY_TAGS.find(p => p.value === value) || PRIORITY_TAGS[0];

const formatRelativeActivity = (value, fallbackDays = 0) => {
  if (!value) return `Last update: ${fallbackDays || 0}d ago`;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return `Last update: ${fallbackDays || 0}d ago`;
  const days = Math.max(0, Math.round((Date.now() - d.getTime()) / 86400000));
  if (days === 0) return "Last update: today";
  if (days === 1) return "Last update: 1d ago";
  return `Last update: ${days}d ago`;
};

const isBackwardMove = (fromStage, toStage) => {
  const from = stageIndex(fromStage);
  const to = stageIndex(toStage);
  return from >= 0 && to >= 0 && to < from;
};

const normalizeApplications = (apps) => (apps || []).map((app, index) => ({
  priority: app.priority ?? "",
  nextAction: app.stage === "Technical Interview" ? "Schedule technical interview" : app.stage === "HM Review" ? "Await HM feedback" : "Review CV",
  lastActivityAt: app.lastActivityAt || app.appliedDate || todayISO(),
  ...app,
}));

const hasSalaryAccess = (user) => !!(user?.canViewSalary || user?.canSeeAll || user?.canApproveOffer);
const hasOfferApprovalAccess = (user) => !!(user?.canApproveOffer || user?.canApproveOffers);
const hasRequisitionApprovalAccess = (user) => !!(user?.canApproveRequisition || user?.canApproveRequisitions);
const nextHiringRequestApprovalStep = (request) => {
  if (!request?.managerApproved) return "manager";
  if (!request?.hrApproved) return "hr";
  if (!request?.ceoApproved) return "admin";
  return "";
};
const canApproveHiringRequestStep = (request, currentRole, roleConfig) => {
  const step = nextHiringRequestApprovalStep(request);
  if (!step || request?.status === "Approved") return false;
  if (currentRole === "Admin") return true;
  if (step === "hr") return currentRole === "Recruiter";
  if (step === "admin") return hasRequisitionApprovalAccess(roleConfig);
  if (step === "manager") {
    return currentRole === "Hiring Manager" || hasRequisitionApprovalAccess(roleConfig);
  }
  return false;
};
const hiringRequestApprovalButtonLabel = (request) => {
  const step = nextHiringRequestApprovalStep(request);
  if (step === "manager") return "Approve manager";
  if (step === "hr") return "Approve HR";
  if (step === "admin") return "Approve admin";
  return "Approved";
};
const pct = (value, total) => total ? Math.round((Number(value) / Number(total)) * 100) : 0;
const normalizeEmail = (value) => String(value || "").trim().toLowerCase();
const hasCandidateCv = (candidate) => Boolean((candidate?.cvUrl && candidate.cvUrl !== "#") || candidate?.cvFileName || candidate?.cvTextExtracted);
const isGeneratedCandidateEmail = (email) => /@(no-email|unknown)\.local$/i.test(String(email || ""));
const candidateEmailDisplay = (email) => {
  const value = String(email || "").trim();
  return value && !isGeneratedCandidateEmail(value) ? value : "—";
};
const isLowConfidenceCandidate = (candidate) => !candidate?.email || isGeneratedCandidateEmail(candidate.email) || !candidate?.name || !hasCandidateCv(candidate);

const ENTERPRISE_ROADMAP_ITEMS = [
  { id: "ATS-PX-001", priority: "Critical", category: "Resume intelligence", module: "Talent Database", title: "PDF/Word parsing, duplicate detection, source history, and merge review", impact: "High", ux: "High", complexity: "Medium", next: "Track parsing confidence and route possible duplicates to an admin review queue." },
  { id: "ATS-PX-002", priority: "Important", category: "Global UI", module: "All modules", title: "Consistent success messages, validation, disabled-state reasons, and row actions", impact: "Medium", ux: "High", complexity: "Low", next: "Use shared buttons, alerts, empty states, and confirmation patterns." },
  { id: "ATS-PX-003", priority: "Critical", category: "Governed workflow", module: "Requests/Requisitions", title: "Link hiring request, approval, requisition, pipeline, offer, and hire outcome", impact: "High", ux: "Medium", complexity: "Medium", next: "Show approval owners and status history on every requisition." },
  { id: "ATS-PX-004", priority: "Critical", category: "RBAC", module: "Settings", title: "Admin editable roles, scopes, salary visibility, and approval permissions", impact: "High", ux: "High", complexity: "Medium", next: "Keep role changes auditable and explain each permission before saving." },
  { id: "ATS-PX-005", priority: "Important", category: "Recruiter productivity", module: "Active Hiring Pipeline", title: "Saved views, workload filters, stuck queues, reminders, and bulk actions", impact: "High", ux: "High", complexity: "Medium", next: "Use the recruiter workbench as the daily triage screen." },
  { id: "ATS-PX-006", priority: "Important", category: "Hiring manager experience", module: "Interviews/Scorecards", title: "Focused HM workspace for assigned jobs, CVs, scorecards, and approvals", impact: "High", ux: "High", complexity: "Medium", next: "Keep managers away from unrelated HR data." },
  { id: "ATS-PX-007", priority: "Important", category: "Analytics", module: "Dashboard", title: "Time to fill, stage conversion, source quality, recruiter load, and offer acceptance", impact: "High", ux: "Medium", complexity: "Medium", next: "Add drill-through from each metric to the records behind it." },
  { id: "ATS-PX-008", priority: "Important", category: "Automation", module: "Pipeline/Interviews", title: "Reminders for overdue feedback, stuck candidates, interviews, and approvals", impact: "High", ux: "Medium", complexity: "Medium", next: "Start with overdue feedback and stuck-stage alerts." },
  { id: "ATS-PX-009", priority: "Important", category: "Candidate communication", module: "Talent Database", title: "Email templates, contact history, rejection reasons, and candidate-facing consistency", impact: "Medium", ux: "High", complexity: "Medium", next: "Create templates for screening, interview, rejection, offer, and missing documents." },
  { id: "ATS-PX-010", priority: "Nice-to-have", category: "Responsive UX", module: "Mobile/tablet", title: "Optimize manager approvals, scorecards, and candidate review on mobile", impact: "Medium", ux: "Medium", complexity: "Medium", next: "Prioritize approval and scorecard views before full pipeline management." },
  { id: "ATS-PX-011", priority: "Important", category: "AI assistance", module: "AI QA/Resume Intelligence", title: "Summaries, fit notes, missing fields, JD drafting, and anomaly detection", impact: "High", ux: "High", complexity: "High", next: "Keep AI explainable, optional, and auditable." },
  { id: "ATS-PX-012", priority: "Critical", category: "Audit/security", module: "Audit", title: "Audit exports, CV downloads, salary visibility, deletes, approvals, and permission failures", impact: "High", ux: "Medium", complexity: "Medium", next: "Add audit entries and retention rules for sensitive ATS actions." },
  { id: "ATS-RX-001", priority: "Important", category: "Action clarity", module: "Job Requisitions", title: "Show why Close/Reopen is unavailable for each requisition state", impact: "Medium", ux: "High", complexity: "Low", next: "Keep the existing disabled reason visible near the action." },
];

const COMMUNICATION_TEMPLATES = [
  { name: "Screening invite", trigger: "Moved to HR Screening", owner: "Recruiter", status: "Draft template" },
  { name: "Interview schedule", trigger: "Interview scheduled", owner: "Recruiter", status: "Draft template" },
  { name: "Rejection message", trigger: "Application rejected with reason", owner: "Recruiter", status: "Needs HR wording" },
  { name: "Offer follow-up", trigger: "Offer approved", owner: "Recruiter", status: "Draft template" },
  { name: "Missing documents", trigger: "Candidate profile incomplete", owner: "Recruiter", status: "Draft template" },
];

const AUTOMATION_RULES = [
  { name: "Stuck application alert", trigger: "5+ days in one stage", audience: "Recruiter", status: "Ready to configure" },
  { name: "Feedback chase", trigger: "Interview completed without scorecard", audience: "Interviewer/Hiring Manager", status: "Ready to configure" },
  { name: "Pending approval reminder", trigger: "Requisition or offer waiting approval", audience: "Approver", status: "Ready to configure" },
  { name: "Upcoming interview reminder", trigger: "24 hours before interview", audience: "Candidate/Interviewer", status: "Design required" },
];

const AUDIT_SECURITY_CHECKS = [
  { name: "Exports", coverage: "Recommended", detail: "Log who exported requisitions, candidate lists, and reports." },
  { name: "CV access/downloads", coverage: "Recommended", detail: "Log every CV preview and download action." },
  { name: "Salary visibility", coverage: "Recommended", detail: "Log offer and salary views for sensitive roles." },
  { name: "Deletes", coverage: "Recommended", detail: "Require confirmation and retain audit entries for deleted records." },
  { name: "Role changes", coverage: "In place", detail: "Admin user edits should remain auditable with old and new values." },
  { name: "Permission failures", coverage: "Recommended", detail: "Track 403 responses and surface them clearly in QA reports." },
];

const buildRecruiterWorkbench = (applications = [], candidates = [], jobs = [], interviews = [], scorecards = []) => {
  const activeApps = applications.filter(app => app.status === "Active");
  const delayedApps = activeApps.filter(app => (app.daysInStage || 0) >= 5);
  const pendingFeedback = interviews.filter(interview => interview.status === "Scheduled" && !scorecards.some(score => score.applicationId === interview.applicationId));
  const unassignedJobs = jobs.filter(job => job.status === "Open" && (!job.recruiter || job.recruiter === "Unassigned" || job.recruiter === "—"));
  const missingNextAction = activeApps.filter(app => !app.nextAction);
  const enrich = (app) => {
    const candidate = candidates.find(c => c.id === app.candidateId);
    const job = jobs.find(j => j.id === app.jobId);
    return { ...app, candidate, job };
  };
  return {
    delayedApps: delayedApps.map(enrich),
    pendingFeedback,
    unassignedJobs,
    missingNextAction: missingNextAction.map(enrich),
    savedViews: [
      { name: "Stuck stage queue", count: delayedApps.length, detail: "Applications delayed 5+ days" },
      { name: "Feedback chase list", count: pendingFeedback.length, detail: "Interviews waiting for scorecards" },
      { name: "Unassigned requisitions", count: unassignedJobs.length, detail: "Open roles without recruiter owner" },
      { name: "Missing next action", count: missingNextAction.length, detail: "Active applications without a next step" },
    ],
  };
};

const buildReadiness = ({ jobs = [], candidates = [], applications = [], offers = [], interviews = [], scorecards = [], auditLogs = [] }) => {
  const checks = [
    { label: "Microsoft login and RBAC", ok: true },
    { label: "Persistent backend data", ok: true },
    { label: "Talent database separation", ok: candidates.length >= 0 && applications.length >= 0 },
    { label: "Resume parsing coverage visible", ok: true },
    { label: "Recruiter pipeline workbench", ok: true },
    { label: "Hiring manager workspace", ok: true },
    { label: "Executive metrics", ok: true },
    { label: "Communication templates", ok: true },
    { label: "Automation rules", ok: true },
    { label: "Audit/security controls", ok: auditLogs.length > 0 },
  ];
  return {
    checks,
    score: pct(checks.filter(check => check.ok).length, checks.length),
    counts: {
      openJobs: jobs.filter(job => job.status === "Open").length,
      activeApplications: applications.filter(app => app.status === "Active").length,
      offers: offers.length,
      interviews: interviews.length,
      scorecards: scorecards.length,
    },
  };
};

const buildAuditTrail = ({ candidates, applications, jobs, interviews, scorecards, offers, hiringRequests }) => {
  const jobById = new Map(jobs.map(job => [job.id, job]));
  const appById = new Map(applications.map(app => [app.id, app]));
  const candidateById = new Map(candidates.map(candidate => [candidate.id, candidate]));
  const logs = [];

  candidates.forEach(candidate => {
    logs.push({ at: candidate.addedDate, action: "Candidate created", user: candidate.owner || "Recruiter", oldValue: "—", newValue: candidate.name });
  });
  applications.forEach(app => {
    const candidate = candidateById.get(app.candidateId);
    const job = jobById.get(app.jobId);
    logs.push({ at: app.lastActivityAt || app.appliedDate, action: app.stage === "Rejected" ? "Candidate rejected" : "Candidate moved", user: app.recruiter || "Recruiter", oldValue: "Applied", newValue: `${candidate?.name || "Candidate"} → ${app.stage} (${job?.title || "Job"})` });
  });
  interviews.forEach(interview => {
    const app = appById.get(interview.applicationId);
    const candidate = app ? candidateById.get(app.candidateId) : null;
    logs.push({ at: interview.scheduledAt, action: "Interview scheduled", user: interview.interviewerId, oldValue: "—", newValue: `${candidate?.name || "Candidate"} · ${interview.type}` });
  });
  scorecards.forEach(score => {
    const app = appById.get(score.applicationId);
    const candidate = app ? candidateById.get(app.candidateId) : null;
    logs.push({ at: score.submittedDate, action: "Feedback submitted", user: score.interviewerId, oldValue: "Pending feedback", newValue: `${candidate?.name || "Candidate"} · ${score.recommendation}` });
  });
  hiringRequests.forEach(request => {
    logs.push({ at: request.requestDate, action: request.status === "Approved" ? "Requisition approved" : "Hiring request submitted", user: request.requestedBy, oldValue: "Draft", newValue: `${request.title} · ${request.status}` });
  });
  offers.forEach(offer => {
    const app = appById.get(offer.applicationId);
    const candidate = app ? candidateById.get(app.candidateId) : null;
    logs.push({ at: offer.approvedDate || offer.createdDate, action: offer.status === "Pending Approval" ? "Offer created" : `Offer ${offer.status.toLowerCase()}`, user: offer.approvedBy || offer.createdBy, oldValue: "Pending Approval", newValue: `${candidate?.name || "Candidate"} · ${offer.status}` });
  });

  return logs
    .filter(log => log.at)
    .sort((a, b) => new Date(String(b.at).replace(" ", "T")) - new Date(String(a.at).replace(" ", "T")));
};

const ROLE_FROM_BACKEND = {
  admin: "Admin",
  recruiter: "Recruiter",
  hiring_manager: "Hiring Manager",
  interviewer: "Interviewer",
};

const ROLE_TO_BACKEND = {
  Admin: "admin",
  Recruiter: "recruiter",
  "Hiring Manager": "hiring_manager",
  Interviewer: "interviewer",
};

const STAGE_TO_BACKEND = {
  "Applied": "applied",
  "HR Screening": "screening",
  "HM Review": "screening",
  "1st Interview": "interview",
  "Technical Interview": "assessment",
  "Final Interview": "interview",
  "Offer": "offer",
  "Hired": "hired",
  "Rejected": "rejected",
};

function splitName(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  return { firstName: parts[0] || "", lastName: parts.slice(1).join(" ") || "-" };
}

function normalizeCandidateSource(source) {
  const normalized = String(source || "").trim().toLowerCase();
  if (normalized === "linkedin") return "LinkedIn";
  if (normalized === "forasna" || normalized === "job_board") return "Forasna";
  if (normalized === "career" || normalized === "career email" || normalized === "career_email" || normalized === "other") return "Career Email";
  if (normalized === "referral") return "Referral";
  if (normalized === "internal" || normalized === "internal_transfer") return "Internal Transfer";
  return source || "Career Email";
}

function LoginScreen({ onLogin, loading, error }) {
  return (
    <>
      <style>{css}</style>
      <div data-testid="login-screen" className="app" style={{ alignItems: "center", justifyContent: "center", background: "var(--bg)" }}>
        <div className="card" style={{ width: "min(440px, calc(100vw - 32px))" }}>
          <div className="card-header"><div className="card-title">Karm. ATS Secure Login</div></div>
          <div className="card-body">
            {!authConfigReady && (
              <div className="alert alert-amber" style={{ marginBottom: 16 }}>
                <Icon name="alert" size={14} />
                Microsoft login is not configured yet. Add VITE_AZURE_AD_TENANT_ID and VITE_AZURE_AD_CLIENT_ID.
              </div>
            )}
            {error && <div data-testid="login-error" className="alert alert-amber" style={{ marginBottom: 16 }}><Icon name="alert" size={14} />{error}</div>}
            <button className="btn btn-primary" onClick={onLogin} disabled={!authConfigReady || loading} style={{ width: "100%", justifyContent: "center", opacity: !authConfigReady || loading ? 0.6 : 1 }}>
              {loading ? "Signing in..." : "Sign in with Microsoft 365"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function LoadingShell({ text = "Loading ATS data..." }) {
  return (
    <>
      <style>{css}</style>
      <div className="app" style={{ alignItems: "center", justifyContent: "center", background: "var(--bg)" }}>
        <div className="card"><div className="card-body" style={{ minWidth: 280, textAlign: "center", color: "var(--text2)" }}>{text}</div></div>
      </div>
    </>
  );
}

export default function App() {
  const [booting, setBooting] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");
  const [user, setUser] = useState(null);
  const [backendData, setBackendData] = useState(null);
  const [dataError, setDataError] = useState("");

  const loadData = async (session = user) => {
    setDataError("");
    try {
      const includeAdminData = session?.role === "admin";
      const data = await fetchAtsData({
        includeAudit: includeAdminData,
        includeUsers: includeAdminData,
      });
      setBackendData(data);
      return data;
    } catch (e) {
      setDataError(e.message);
      setBackendData(prev => prev || {
        jobs: [],
        candidates: [],
        applications: [],
        interviews: [],
        offers: [],
        scorecards: [],
        hiringRequests: [],
        auditLogs: [],
        users: [],
      });
      return null;
    }
  };

  useEffect(() => {
    let mounted = true;
    completeMicrosoftRedirect()
      .then(u => u || restoreSession())
      .then(async u => {
        if (!mounted) return;
        setUser(u);
        if (u) await loadData(u);
      })
      .catch(e => mounted && setAuthError(e.message))
      .finally(() => mounted && setBooting(false));
    return () => { mounted = false; };
  }, []);

  const handleLogin = async () => {
    setAuthLoading(true);
    setAuthError("");
    try {
      const u = await microsoftLogin();
      setUser(u);
      await loadData(u);
    } catch (e) {
      setAuthError(e.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    setUser(null);
    setBackendData(null);
  };

  if (booting) return <LoadingShell text="Checking secure session..." />;
  if (!user) return <LoginScreen onLogin={handleLogin} loading={authLoading} error={authError} />;
  if (!backendData && !dataError) return <LoadingShell />;

  return (
    <LegacyAtsApp
      key={`${user.id}-${backendData ? "loaded" : "empty"}`}
      sessionUser={user}
      backendData={backendData}
      dataError={dataError}
      reloadData={loadData}
      logout={handleLogout}
    />
  );
}

function LegacyAtsApp({ sessionUser, backendData, dataError, reloadData, logout: logoutUser }) {
  const [page, setPage] = useState("dashboard");
  const [currentRole] = useState(ROLE_FROM_BACKEND[sessionUser.role] || "Interviewer");
  const [modal, setModal] = useState(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // Backend state. Local setters update the current view immediately; reloadData()
  // pulls the durable source of truth back from the database after API actions.
  const [jobs, setJobsRaw] = useState(() => backendData?.jobs || []);
  const [candidates, setCandidatesRaw] = useState(() => backendData?.candidates || []);
  const [applications, setApplicationsRaw] = useState(() => normalizeApplications(backendData?.applications || []));
  const [scorecards, setScorecardsRaw] = useState(() => backendData?.scorecards || []);
  const [offers, setOffersRaw] = useState(() => backendData?.offers || []);
  const [interviews, setInterviewsRaw] = useState(() => backendData?.interviews || []);
  const [hiringRequests, setHiringRequestsRaw] = useState(() => backendData?.hiringRequests || []);
  const [auditLogs, setAuditLogsRaw] = useState(() => backendData?.auditLogs || []);
  const [backendUsers, setBackendUsersRaw] = useState(() => backendData?.users || []);
  const [roleAssignments, setRoleAssignmentsRaw] = useState(() => normalizeRoleAssignments(DEFAULT_ROLE_ASSIGNMENTS));

  const persist = (_key, setter) => (updater) => {
    setter(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      return next;
    });
  };
  const setJobs         = persist("karm_jobs", setJobsRaw);
  const setCandidates   = persist("karm_candidates", setCandidatesRaw);
  const setApplications = persist("karm_applications", setApplicationsRaw);
  const setScorecards   = persist("karm_scorecards", setScorecardsRaw);
  const setOffers       = persist("karm_offers", setOffersRaw);
  const setInterviews   = persist("karm_interviews", setInterviewsRaw);
  const setHiringRequests = persist("karm_hiring_requests", setHiringRequestsRaw);
  const setRoleAssignments = persist("karm_roles", setRoleAssignmentsRaw);

  useEffect(() => {
    if (!backendData) return;
    setJobsRaw(backendData.jobs || []);
    setCandidatesRaw(backendData.candidates || []);
    setApplicationsRaw(normalizeApplications(backendData.applications || []));
    setScorecardsRaw(backendData.scorecards || []);
    setOffersRaw(backendData.offers || []);
    setInterviewsRaw(backendData.interviews || []);
    setHiringRequestsRaw(backendData.hiringRequests || []);
    setAuditLogsRaw(backendData.auditLogs || []);
    setBackendUsersRaw(backendData.users || []);
  }, [backendData]);

  // Build ROLES_CONFIG dynamically from roleAssignments
  const ROLES_CONFIG = {};
  Object.entries(roleAssignments).forEach(([role, indexes]) => {
    const firstIdx = (Array.isArray(indexes) ? indexes : [indexes]).find(idx => TEAM[idx]) ?? DEFAULT_ROLE_ASSIGNMENTS[role]?.[0];
    ROLES_CONFIG[role] = { ...ROLE_PERMISSIONS[role], ...TEAM[firstIdx] };
  });
  const sessionName = sessionUser.fullName || [sessionUser.firstName, sessionUser.lastName].filter(Boolean).join(" ") || sessionUser.email;
  const sessionDepartment = sessionUser.department?.name || sessionUser.employee?.department?.name || "";
  const sessionBase = {
    email: sessionUser.email,
    fullName: sessionName,
    initials: initials(sessionName || sessionUser.email || "U"),
    color: "#34d399",
    department: sessionDepartment,
    accessScope: sessionUser.accessScope,
    active: true,
    canViewSalary: !!sessionUser.canViewSalary,
    canApproveOffers: !!sessionUser.canApproveOffers,
    canApproveRequisitions: !!sessionUser.canApproveRequisitions,
  };
  const roleConfig = {
    ...(ROLES_CONFIG[currentRole] || { ...ROLE_PERMISSIONS["Admin"], ...TEAM[9] }),
    ...sessionBase,
    canApproveOffer: !!sessionUser.canApproveOffers,
    canApproveRequisition: !!sessionUser.canApproveRequisitions,
  };
  const isAdmin = currentRole === "Admin";
  const isRecruiter = currentRole === "Recruiter";
  const isHiringManager = currentRole === "Hiring Manager";
  const isInterviewer = currentRole === "Interviewer";
  const canViewSalary = currentRole === "Admin" || !!sessionUser.canViewSalary;
  const canApproveOffers = currentRole === "Admin" || !!sessionUser.canApproveOffers;
  const assignedInterviewAppIds = new Set(interviews.filter(i => i.interviewerId === roleConfig.fullName).map(i => i.applicationId));

  const canAccessJob = (job) => {
    if (isAdmin) return true;
    if (isRecruiter) return ["All recruitment data", "All system data", "all_data", "recruitment_data"].includes(roleConfig.accessScope) || job.recruiter === roleConfig.fullName;
    if (isHiringManager) return job.hiringManager === roleConfig.fullName || job.dept === roleConfig.department;
    if (isInterviewer) return applications.some(app => app.jobId === job.id && assignedInterviewAppIds.has(app.id));
    return false;
  };

  const scopedJobs = jobs.filter(canAccessJob);
  const scopedJobIds = new Set(scopedJobs.map(job => job.id));
  const scopedApplications = applications.filter(app => {
    if (isAdmin || isRecruiter || isHiringManager) return scopedJobIds.has(app.jobId);
    if (isInterviewer) return assignedInterviewAppIds.has(app.id);
    return false;
  });
  const scopedApplicationIds = new Set(scopedApplications.map(app => app.id));
  const scopedCandidateIds = new Set(scopedApplications.map(app => app.candidateId));
  const scopedCandidates = candidates.filter(candidate => isAdmin || isRecruiter || scopedCandidateIds.has(candidate.id));
  const scopedInterviews = interviews.filter(interview => {
    if (isAdmin || isRecruiter) return true;
    if (isHiringManager) return scopedApplicationIds.has(interview.applicationId);
    if (isInterviewer) return interview.interviewerId === roleConfig.fullName;
    return false;
  });
  const scopedOffers = offers.filter(offer => {
    if (isAdmin || isRecruiter) return true;
    if ((isHiringManager && canApproveOffers) || isInterviewer) return scopedApplicationIds.has(offer.applicationId);
    return isHiringManager && scopedApplicationIds.has(offer.applicationId) && canApproveOffers;
  });
  const scopedHiringRequests = hiringRequests.filter(request => {
    if (isAdmin || isRecruiter) return true;
    if (isHiringManager) return request.requestedBy === roleConfig.fullName || request.dept === roleConfig.department;
    return false;
  });
  const derivedAuditLogs = auditLogs.length
    ? auditLogs
    : buildAuditTrail({ candidates, applications, jobs, interviews, scorecards, offers, hiringRequests });
  const allUsers = backendUsers.length ? backendUsers : TEAM;

  const resetAllData = () => setShowResetConfirm(false);

  const openModal = (type, data = {}) => setModal({ type, data });
  const closeModal = () => setModal(null);

  const openJobs        = scopedJobs.filter(j => j.status === "Open").length;
  const pendingOffers   = scopedOffers.filter(o => o.status === "Pending Approval").length;
  const pendingScorecards = scopedInterviews.filter(i => i.status === "Scheduled").length;

  const allNav = [
    { id: "dashboard",  label: "Dashboard",        icon: "dashboard" },
    { id: "requests",   label: "Hiring Requests",   icon: "jobs",       badge: scopedHiringRequests.filter(r => r.status.includes("Pending")).length, badgeColor: "amber" },
    { id: "jobs",       label: "Job Requisitions",  icon: "jobs",       badge: openJobs },
    { id: "candidates", label: "Talent Database",   icon: "candidates" },
    { id: "pipeline",   label: "Active Hiring Pipeline", icon: "pipeline" },
    { id: "interviews", label: "Interviews",        icon: "interviews", badge: pendingScorecards, badgeColor: "amber" },
    { id: "offers",     label: "Offers",            icon: "offers",     badge: pendingOffers, badgeColor: "red" },
  ];
  if (isAdmin) allNav.push({ id: "settings", label: "Settings", icon: "settings" });
  const roleNav = {
    Admin: ["dashboard", "requests", "jobs", "candidates", "pipeline", "interviews", "offers", "settings"],
    Recruiter: ["dashboard", "requests", "jobs", "candidates", "pipeline", "interviews", "offers"],
    "Hiring Manager": ["dashboard", "requests", "jobs", "candidates", "interviews", "offers"],
    Interviewer: ["interviews"],
  };
  const allowedPages = roleNav[currentRole] || ["dashboard"];
  const nav = allNav.filter(item => allowedPages.includes(item.id));
  const activePage = allowedPages.includes(page) ? page : allowedPages[0];

  const pages = { dashboard: DashboardPage, requests: HiringRequestsPage, jobs: JobsPage, candidates: CandidatesPage, pipeline: PipelinePage, interviews: InterviewsPage, offers: OffersPage, settings: SettingsPage };
  const PageComponent = pages[activePage] || DashboardPage;

  const ctx = { jobs: scopedJobs, setJobs, candidates: scopedCandidates, setCandidates, applications: scopedApplications, setApplications, scorecards, setScorecards, offers: scopedOffers, setOffers, interviews: scopedInterviews, setInterviews, hiringRequests: scopedHiringRequests, setHiringRequests, roleAssignments, setRoleAssignments, ROLES_CONFIG, auditLogs: derivedAuditLogs, dashboardAuditLogs: auditLogs, backendUsers: allUsers, openModal, closeModal, currentRole, roleConfig, canViewSalary, canApproveOffers, allUsers, stageIndex, backendActions, reloadData, sessionUser, setPage };

  return (
    <>
      <style>{css}</style>
      <div data-testid="ats-shell" className="app">
        {/* SIDEBAR */}
        <aside className="sidebar">
          <div className="sidebar-logo">
            <div className="sidebar-logo-mark">
              <img className="logo-img" src="./assets/karm-logo.png" alt="Karm" />
            </div>
            <div className="logo-text">Karm. ATS</div>
          </div>
          <nav className="sidebar-nav">
            <div className="nav-section-label">Navigation</div>
            {nav.map(item => (
              <div key={item.id} data-testid={`nav-${item.id}`} className={`nav-item ${activePage === item.id ? "active" : ""}`} onClick={() => setPage(item.id)}>
                <Icon name={item.icon} />
                {item.label}
                {item.badge > 0 && <span className={`nav-badge ${item.badgeColor || ""}`}>{item.badge}</span>}
              </div>
            ))}
          </nav>
          <div className="sidebar-user">
            <div className="user-avatar" style={{ background: roleConfig.color + "22", borderColor: roleConfig.color, color: roleConfig.color }}>{roleConfig.initials}</div>
            <div>
              <div className="user-name">{sessionUser.fullName || roleConfig.fullName}</div>
              <div className="user-role">{currentRole}</div>
            </div>
            <button className="role-switch" onClick={logoutUser}>Logout</button>
          </div>
        </aside>

        {/* MAIN CONTENT */}
        <main className="main">
          {dataError && <div data-testid="backend-error" className="alert alert-amber" style={{ margin: 20 }}><Icon name="alert" size={14} />{dataError}</div>}
          <PageComponent {...ctx} />
        </main>

        {/* MODALS */}
        {modal && <ModalRouter modal={modal} closeModal={closeModal} ctx={ctx} />}

        {/* RESET CONFIRM */}
        {showResetConfirm && (
          <div className="modal-overlay" onClick={() => setShowResetConfirm(false)}>
            <div className="modal" style={{ maxWidth: 360 }} onClick={e => e.stopPropagation()}>
              <div className="modal-header"><div className="modal-title">Reset all data?</div><button className="modal-close" onClick={() => setShowResetConfirm(false)}>×</button></div>
              <div className="modal-body">
                <p style={{ fontSize: 13, color: "var(--text2)", marginBottom: 8 }}>This will delete all jobs, candidates, applications, scorecards, offers, and interviews and restore the sample data.</p>
                <p style={{ fontSize: 12, color: "var(--red)" }}>This cannot be undone.</p>
              </div>
              <div className="modal-footer">
                <button className="btn btn-ghost" onClick={() => setShowResetConfirm(false)}>Cancel</button>
                <button className="btn btn-danger" onClick={resetAllData}>Yes, reset everything</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ── MODAL ROUTER ──────────────────────────────────────────────────────────────
function ModalRouter({ modal, closeModal, ctx }) {
  const M = {
    addHiringRequest: AddHiringRequestModal,
    addJob: AddJobModal,
    addCandidate: AddCandidateModal,
    viewCandidate: ViewCandidateModal,
    scorecard: ScorecardModal,
    addOffer: AddOfferModal,
    viewOffer: ViewOfferModal,
    scheduleInterview: ScheduleInterviewModal,
    moveStage: MoveStageModal,
    newJoiners: NewJoinersModal,
    interviewsThisWeek: InterviewsThisWeekModal,
    offerAcceptance: OfferAcceptanceModal,
    pendingOffers: PendingOffersModal,
    openRequisitions: OpenRequisitionsModal,
  };
  const Component = M[modal.type];
  if (!Component) return null;
  return <Component data={modal.data} closeModal={closeModal} ctx={ctx} />;
}

// ── ENTERPRISE READINESS PANELS ───────────────────────────────────────────────
function EnterpriseReadinessPanel({ jobs, candidates, applications, offers, interviews, scorecards, auditLogs }) {
  const readiness = buildReadiness({ jobs, candidates, applications, offers, interviews, scorecards, auditLogs });

  return (
    <div data-testid="enterprise-readiness-panel" className="card" style={{ marginBottom: 20 }}>
      <div className="card-header">
        <div>
          <div className="card-title">QA/Product readiness</div>
          <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 2 }}>Internal admin diagnostic for workflow, governance, automation, and audit coverage</div>
        </div>
        <span className={`badge ${readiness.score >= 80 ? "badge-green" : readiness.score >= 60 ? "badge-amber" : "badge-red"}`}>{readiness.score}% ready</span>
      </div>
      <div className="card-body">
        <div className="readiness-bar" style={{ marginBottom: 16 }}>
          <div className="readiness-bar-fill" style={{ width: `${readiness.score}%` }} />
        </div>
        <div className="insight-grid">
          <div className="insight-card">
            <div className="insight-label">Open roles</div>
            <div className="insight-value">{readiness.counts.openJobs}</div>
            <div className="insight-copy">Requisitions visible to HR</div>
          </div>
          <div className="insight-card">
            <div className="insight-label">Active applications</div>
            <div className="insight-value">{readiness.counts.activeApplications}</div>
            <div className="insight-copy">Live hiring workflow records</div>
          </div>
          <div className="insight-card">
            <div className="insight-label">Interviews</div>
            <div className="insight-value">{readiness.counts.interviews}</div>
            <div className="insight-copy">Scheduled and completed</div>
          </div>
          <div className="insight-card">
            <div className="insight-label">Scorecards</div>
            <div className="insight-value">{readiness.counts.scorecards}</div>
            <div className="insight-copy">Structured feedback captured</div>
          </div>
        </div>
        <div className="compact-list" style={{ marginTop: 16 }}>
          {readiness.checks.map(check => (
            <div className="compact-row" key={check.label}>
              <span>{check.label}</span>
              <span className={`badge ${check.ok ? "badge-green" : "badge-amber"}`}>{check.ok ? "Visible" : "Needs data"}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function OperationalDashboardPanel({ jobs = [], candidates = [], applications = [], offers = [], interviews = [], scorecards = [], hiringRequests = [] }) {
  const candidateById = new Map(candidates.map(candidate => [candidate.id, candidate]));
  const jobById = new Map(jobs.map(job => [job.id, job]));
  const activeApplications = applications.filter(app => app.status === "Active");
  const delayedApplications = activeApplications
    .filter(app => (app.daysInStage || 0) >= 5)
    .sort((a, b) => (b.daysInStage || 0) - (a.daysInStage || 0))
    .slice(0, 4);
  const pendingOffers = offers.filter(offer => offer.status === "Pending Approval");
  const pendingRequests = hiringRequests.filter(request => String(request.status || "").toLowerCase().includes("pending"));
  const pendingFeedback = interviews.filter(interview => {
    const hasScorecard = scorecards.some(scorecard => scorecard.applicationId === interview.applicationId);
    return interview.status === "Completed" && !hasScorecard;
  });
  const toDateKey = (value) => {
    if (!value) return "";
    const parsed = new Date(String(value).replace(" ", "T"));
    return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
  };
  const todayKey = todayISO();
  const todaysInterviews = interviews
    .filter(interview => toDateKey(interview.scheduledAt) === todayKey && interview.status !== "Cancelled")
    .sort((a, b) => String(a.scheduledAt).localeCompare(String(b.scheduledAt)));
  const upcomingInterviews = interviews
    .filter(interview => toDateKey(interview.scheduledAt) >= todayKey && interview.status === "Scheduled")
    .sort((a, b) => String(a.scheduledAt).localeCompare(String(b.scheduledAt)))
    .slice(0, 4);
  const recruiterEntries = Object.entries(activeApplications.reduce((acc, app) => {
    const recruiter = app.recruiter || jobById.get(app.jobId)?.recruiter || "Unassigned";
    acc[recruiter] = (acc[recruiter] || 0) + 1;
    return acc;
  }, {})).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const sourceEntries = Object.entries(candidates.reduce((acc, candidate) => {
    const source = candidate.source || "Unknown";
    acc[source] = (acc[source] || 0) + 1;
    return acc;
  }, {})).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const maxRecruiterLoad = Math.max(...recruiterEntries.map(([, count]) => count), 1);
  const maxSourceCount = Math.max(...sourceEntries.map(([, count]) => count), 1);
  const avgDaysInStage = activeApplications.length
    ? Math.round(activeApplications.reduce((sum, app) => sum + (Number(app.daysInStage) || 0), 0) / activeApplications.length)
    : 0;
  const openRoles = jobs.filter(job => job.status === "Open").length;
  const actionTotal = delayedApplications.length + pendingOffers.length + pendingRequests.length + pendingFeedback.length;

  const appLabel = (app) => {
    const candidate = candidateById.get(app.candidateId);
    const job = jobById.get(app.jobId);
    return {
      candidateName: candidate?.name || "Candidate",
      jobTitle: job?.title || "Unassigned role",
    };
  };

  const interviewLabel = (interview) => {
    const app = applications.find(item => item.id === interview.applicationId);
    const candidate = app ? candidateById.get(app.candidateId) : null;
    const job = app ? jobById.get(app.jobId) : null;
    return `${candidate?.name || "Candidate"} · ${job?.title || interview.type}`;
  };

  return (
    <div data-testid="operational-dashboard-panel" className="card" style={{ marginBottom: 20 }}>
      <div className="card-header">
        <div>
          <div className="card-title">Recruiter action center</div>
          <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 2 }}>Daily work queue, pipeline health, approvals, interviews, workload, and hiring velocity</div>
        </div>
        <span className={`badge ${actionTotal > 0 ? "badge-amber" : "badge-green"}`}>{actionTotal} pending action{actionTotal === 1 ? "" : "s"}</span>
      </div>
      <div className="card-body">
        <div className="insight-grid">
          <div className="insight-card">
            <div className="insight-label">Delayed candidates</div>
            <div className="insight-value" style={{ color: delayedApplications.length ? "var(--red)" : "var(--text)" }}>{delayedApplications.length}</div>
            <div className="insight-copy">5+ days in current stage</div>
          </div>
          <div className="insight-card">
            <div className="insight-label">Interviews today</div>
            <div className="insight-value">{todaysInterviews.length}</div>
            <div className="insight-copy">{upcomingInterviews.length} upcoming scheduled</div>
          </div>
          <div className="insight-card">
            <div className="insight-label">Pending approvals</div>
            <div className="insight-value">{pendingOffers.length + pendingRequests.length}</div>
            <div className="insight-copy">Offers and hiring requests</div>
          </div>
          <div className="insight-card">
            <div className="insight-label">Hiring velocity</div>
            <div className="insight-value">{avgDaysInStage}d</div>
            <div className="insight-copy">Average days in stage</div>
          </div>
          <div className="insight-card">
            <div className="insight-label">Open roles</div>
            <div className="insight-value">{openRoles}</div>
            <div className="insight-copy">Active requisitions to staff</div>
          </div>
          <div className="insight-card">
            <div className="insight-label">Feedback due</div>
            <div className="insight-value">{pendingFeedback.length}</div>
            <div className="insight-copy">Completed interviews missing scorecards</div>
          </div>
        </div>

        <div className="dashboard-work-grid">
          <div className="compact-list">
            <div className="compact-row">
              <strong style={{ fontSize: 12, color: "var(--text)" }}>Priority follow-up</strong>
              <span className="badge badge-red">{delayedApplications.length} delayed</span>
            </div>
            {delayedApplications.length === 0 ? (
              <div style={{ padding: "12px 14px", fontSize: 12, color: "var(--text3)" }}>No delayed active applications.</div>
            ) : delayedApplications.map(app => {
              const { candidateName, jobTitle } = appLabel(app);
              return (
                <div key={app.id} className="compact-row">
                  <span>{candidateName}<br /><small style={{ color: "var(--text3)" }}>{jobTitle}</small></span>
                  <span className="badge badge-red">{app.daysInStage || 0}d</span>
                </div>
              );
            })}
          </div>

          <div className="compact-list">
            <div className="compact-row">
              <strong style={{ fontSize: 12, color: "var(--text)" }}>Upcoming interviews</strong>
              <span className="badge badge-blue">{upcomingInterviews.length}</span>
            </div>
            {upcomingInterviews.length === 0 ? (
              <div style={{ padding: "12px 14px", fontSize: 12, color: "var(--text3)" }}>No interviews scheduled today or ahead.</div>
            ) : upcomingInterviews.map(interview => (
              <div key={interview.id} className="compact-row">
                <span>{interviewLabel(interview)}<br /><small style={{ color: "var(--text3)" }}>{interview.type}</small></span>
                <span className="badge badge-teal">{formatDisplayDate(interview.scheduledAt)}</span>
              </div>
            ))}
          </div>

          <div className="compact-list">
            <div className="compact-row">
              <strong style={{ fontSize: 12, color: "var(--text)" }}>Approval queue</strong>
              <span className="badge badge-amber">{pendingOffers.length + pendingRequests.length}</span>
            </div>
            <div className="compact-row">
              <span>Offer approvals</span>
              <span className={`badge ${pendingOffers.length ? "badge-amber" : "badge-green"}`}>{pendingOffers.length}</span>
            </div>
            <div className="compact-row">
              <span>Hiring requests</span>
              <span className={`badge ${pendingRequests.length ? "badge-amber" : "badge-green"}`}>{pendingRequests.length}</span>
            </div>
            <div className="compact-row">
              <span>Interview feedback</span>
              <span className={`badge ${pendingFeedback.length ? "badge-amber" : "badge-green"}`}>{pendingFeedback.length}</span>
            </div>
          </div>
        </div>

        <div className="dashboard-breakdown-grid">
          <div className="compact-list">
            <div className="compact-row">
              <strong style={{ fontSize: 12, color: "var(--text)" }}>Recruiter workload</strong>
              <span className="badge badge-blue">{activeApplications.length} active</span>
            </div>
            {recruiterEntries.map(([recruiter, count]) => (
              <div key={recruiter} style={{ padding: "10px 14px" }}>
                <div className="source-row" style={{ marginBottom: 6 }}>
                  <span className="source-name">{recruiter}</span>
                  <span className="source-count">{count}</span>
                </div>
                <div className="mini-bar">
                  <div className="mini-bar-fill" style={{ width: `${(count / maxRecruiterLoad) * 100}%`, background: "var(--teal)" }} />
                </div>
              </div>
            ))}
          </div>

          <div className="compact-list">
            <div className="compact-row">
              <strong style={{ fontSize: 12, color: "var(--text)" }}>Source quality</strong>
              <span className="badge badge-blue">{candidates.length} profiles</span>
            </div>
            {sourceEntries.map(([source, count]) => (
              <div key={source} style={{ padding: "10px 14px" }}>
                <div className="source-row" style={{ marginBottom: 6 }}>
                  <span className="source-name">{source}</span>
                  <span className="source-count">{count}</span>
                </div>
                <div className="mini-bar">
                  <div className="mini-bar-fill" style={{ width: `${(count / maxSourceCount) * 100}%`, background: "var(--accent)" }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function RecruiterWorkbenchPanel({ applications, candidates, jobs, interviews, scorecards, showDelayedOnly = false, onShowDelayedOnly }) {
  const workbench = buildRecruiterWorkbench(applications, candidates, jobs, interviews, scorecards);
  const activateStuckQueue = () => {
    if (workbench.delayedApps.length > 0) onShowDelayedOnly?.();
  };

  return (
    <div data-testid="recruiter-workbench-panel" className="card" style={{ marginBottom: 16 }}>
      <div className="card-header">
        <div>
          <div className="card-title">Recruiter workbench</div>
          <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 2 }}>Saved views for daily triage, stuck candidates, feedback chasing, and unassigned requisitions</div>
        </div>
        <span className="badge badge-blue">Productivity</span>
      </div>
      <div className="card-body">
        <div className="insight-grid">
          {workbench.savedViews.map(view => (
            <div
              className={`insight-card ${view.name === "Stuck stage queue" && workbench.delayedApps.length > 0 ? "clickable" : ""}`}
              key={view.name}
              role={view.name === "Stuck stage queue" && workbench.delayedApps.length > 0 ? "button" : undefined}
              tabIndex={view.name === "Stuck stage queue" && workbench.delayedApps.length > 0 ? 0 : undefined}
              title={view.name === "Stuck stage queue" && workbench.delayedApps.length > 0 ? "Show stuck-stage applications" : undefined}
              onClick={view.name === "Stuck stage queue" ? activateStuckQueue : undefined}
              onKeyDown={view.name === "Stuck stage queue" ? (event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  activateStuckQueue();
                }
              } : undefined}
            >
              <div className="insight-label">{view.name}</div>
              <div className="insight-value">{view.count}</div>
              <div className="insight-copy">
                {view.name === "Stuck stage queue" && showDelayedOnly ? "Showing delayed applications" : view.detail}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function HiringManagerWorkspacePanel({ interviews, applications, candidates, jobs, scorecards, roleConfig }) {
  const managerName = roleConfig?.fullName;
  const assignedJobs = jobs.filter(job => !managerName || job.hiringManager === managerName || roleConfig?.canSeeAll);
  const assignedJobIds = new Set(assignedJobs.map(job => job.id));
  const assignedApps = applications
    .filter(app => assignedJobIds.has(app.jobId) && app.status === "Active")
    .map(app => ({ ...app, candidate: candidates.find(c => c.id === app.candidateId), job: jobs.find(j => j.id === app.jobId) }));
  const pendingScorecards = interviews.filter(interview => interview.status === "Scheduled" && !scorecards.some(score => score.applicationId === interview.applicationId));
  const pendingApprovals = assignedJobs.filter(job => job.status === "Draft" || job.status === "Pending Approval");

  return (
    <div data-testid="hiring-manager-workspace-panel" className="card" style={{ marginBottom: 16 }}>
      <div className="card-header">
        <div>
          <div className="card-title">Hiring manager workspace</div>
          <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 2 }}>Focused assigned jobs, candidate review, pending feedback, and approval actions</div>
        </div>
        <span className="badge badge-purple">Manager view</span>
      </div>
      <div className="card-body">
        <div className="insight-grid">
          <div className="insight-card">
            <div className="insight-label">Assigned roles</div>
            <div className="insight-value">{assignedJobs.length}</div>
            <div className="insight-copy">Jobs visible to this manager scope</div>
          </div>
          <div className="insight-card">
            <div className="insight-label">Active candidates</div>
            <div className="insight-value">{assignedApps.length}</div>
            <div className="insight-copy">Profiles needing hiring input</div>
          </div>
          <div className="insight-card">
            <div className="insight-label">Pending feedback</div>
            <div className="insight-value">{pendingScorecards.length}</div>
            <div className="insight-copy">Scheduled interviews without scorecard</div>
          </div>
          <div className="insight-card">
            <div className="insight-label">Approvals</div>
            <div className="insight-value">{pendingApprovals.length}</div>
            <div className="insight-copy">Draft or pending requisitions</div>
          </div>
        </div>
        <div className="compact-list" style={{ marginTop: 16 }}>
          {assignedApps.slice(0, 5).map(app => (
            <div className="compact-row" key={app.id}>
              <span>{app.candidate?.name || "Candidate"} · {app.job?.title || "Role"}</span>
              <span className={`badge ${stageBadge(app.stage)}`}>{app.stage}</span>
            </div>
          ))}
          {assignedApps.length === 0 && (
            <div className="compact-row">
              <span>No assigned active candidates in this view</span>
              <span className="badge badge-gray">Empty</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CommunicationTemplatesPanel() {
  return (
    <div data-testid="communication-templates-panel" className="card">
      <div className="card-header">
        <div>
          <div className="card-title">Candidate communication templates</div>
          <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 2 }}>Consistent candidate contact history, rejection reasons, and email language</div>
        </div>
        <span className="badge badge-blue">{COMMUNICATION_TEMPLATES.length} templates</span>
      </div>
      <div className="card-body">
        <div className="template-grid">
          {COMMUNICATION_TEMPLATES.map(template => (
            <div className="template-card" key={template.name}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", marginBottom: 5 }}>{template.name}</div>
              <div style={{ fontSize: 12, color: "var(--text2)", marginBottom: 8 }}>{template.purpose}</div>
              <div style={{ fontSize: 11, color: "var(--text3)" }}>{template.trigger}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AutomationPreferencesPanel() {
  return (
    <div data-testid="automation-preferences-panel" className="card">
      <div className="card-header">
        <div>
          <div className="card-title">Automation and reminders</div>
          <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 2 }}>Human-owned alerts for overdue feedback, stuck candidates, interviews, and approvals</div>
        </div>
        <span className="badge badge-amber">Rules</span>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Rule</th><th>Trigger</th><th>Owner</th><th>Channel</th><th>Status</th></tr></thead>
          <tbody>
            {AUTOMATION_RULES.map(rule => (
              <tr key={rule.name}>
                <td className="strong">{rule.name}</td>
                <td>{rule.trigger}</td>
                <td>{rule.owner}</td>
                <td>{rule.channel}</td>
                <td><span className="badge badge-blue">Designed</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AuditSecurityPanel() {
  return (
    <div data-testid="audit-security-panel" className="card">
      <div className="card-header">
        <div>
          <div className="card-title">Audit and security coverage</div>
          <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 2 }}>Sensitive data, exports, CV access, salary visibility, deletes, approvals, and permission failures</div>
        </div>
        <span className="badge badge-red">Critical controls</span>
      </div>
      <div className="card-body">
        <div className="compact-list">
          {AUDIT_SECURITY_CHECKS.map(item => (
            <div className="compact-row" key={item.name}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{item.name}</div>
                <div style={{ fontSize: 12, color: "var(--text3)" }}>{item.detail}</div>
              </div>
              <span className={`badge ${item.coverage === "In place" ? "badge-green" : "badge-amber"}`}>{item.coverage}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function RoadmapPanel() {
  return (
    <div data-testid="enterprise-roadmap-panel" className="card">
      <div className="card-header">
        <div>
          <div className="card-title">Enterprise ATS roadmap</div>
          <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 2 }}>Prioritized enhancements benchmarked against professional ATS expectations</div>
        </div>
        <span className="badge badge-purple">{ENTERPRISE_ROADMAP_ITEMS.length} items</span>
      </div>
      <div className="card-body">
        <div className="roadmap-grid">
          {ENTERPRISE_ROADMAP_ITEMS.map(item => (
            <div className="roadmap-card" key={item.id}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 11, fontFamily: "var(--mono)", color: "var(--text3)" }}>{item.id}</span>
                <span className={`badge ${item.priority === "Critical" ? "badge-red" : item.priority === "Important" ? "badge-amber" : "badge-gray"}`}>{item.priority}</span>
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", marginBottom: 5 }}>{item.module}</div>
              <div style={{ fontSize: 12, color: "var(--text2)", marginBottom: 10 }}>{item.recommendation}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                <span className="tag">Business {item.businessImpact}</span>
                <span className="tag">UX {item.uxImpact}</span>
                <span className="tag">Complexity {item.complexity}</span>
              </div>
              <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 10 }}>{item.nextStep}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── DASHBOARD ─────────────────────────────────────────────────────────────────
function DashboardPage({ jobs, candidates, applications, offers, interviews, hiringRequests = [], openModal, allUsers = [], setPage }) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const nextMonthStart = new Date(today.getFullYear(), today.getMonth() + 1, 1);

  const parseDate = (value) => {
    if (!value) return null;
    const parsed = new Date(String(value).replace(" ", "T"));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };
  const isThisWeek = (value) => {
    const date = parseDate(value);
    return Boolean(date && date >= weekStart && date < weekEnd);
  };
  const isThisMonth = (value) => {
    const date = parseDate(value);
    return Boolean(date && date >= monthStart && date < nextMonthStart);
  };
  const isActiveApplication = (app) => app.status === "Active" && !["Hired", "Rejected", "On Hold"].includes(app.stage);
  const isPlaceholderName = (value) => {
    const normalized = String(value || "").trim().toLowerCase();
    return !normalized || normalized === "recruiter" || normalized === "unassigned" || normalized === "—";
  };
  const isPlaceholderOfferValue = (value) => {
    const normalized = String(value || "").trim().toLowerCase();
    return !normalized || normalized === "candidate" || normalized === "unassigned" || normalized.startsWith("unassigned ");
  };
  const resolveRecruiterName = (app, job) => {
    if (!isPlaceholderName(app?.recruiter)) return app.recruiter;
    if (!isPlaceholderName(job?.recruiter)) return job.recruiter;
    const recruiterId = app?.recruiterId || job?.recruiterId;
    const recruiterUser = recruiterId ? allUsers.find(user => String(user.id) === String(recruiterId)) : null;
    if (!isPlaceholderName(recruiterUser?.fullName)) return recruiterUser.fullName;
    const fallbackRecruiter = allUsers.find(user =>
      user?.active !== false &&
      !isPlaceholderName(user?.fullName) &&
      ["Recruiter", "recruiter"].includes(user.role || user.roleKey)
    );
    return fallbackRecruiter?.fullName || "Unassigned";
  };
  const jobById = new Map(jobs.map(job => [job.id, job]));
  const candidateById = new Map(candidates.map(candidate => [candidate.id, candidate]));
  const activeApplications = applications.filter(isActiveApplication);
  const activeCandidateIds = new Set(activeApplications.map(app => app.candidateId).filter(Boolean));
  const openJobs = jobs.filter(job => job.status === "Open");
  const closedJobs = jobs.filter(job => job.status === "Closed");
  const trackedPositionCount = openJobs.length + closedJobs.length;
  const openRequisitionRows = openJobs
    .map(job => {
      const jobApplications = activeApplications.filter(app => app.jobId === job.id);
      return {
        id: job.id,
        title: job.title || "Untitled requisition",
        department: job.dept || "Unassigned department",
        entity: job.entity || "Unassigned entity",
        recruiter: resolveRecruiterName(null, job),
        headcount: Number(job.headcount) || 1,
        activeCandidates: new Set(jobApplications.map(app => app.candidateId).filter(Boolean)).size,
        openDate: job.openDate,
        status: job.status || "Open",
      };
    })
    .sort((a, b) => b.activeCandidates - a.activeCandidates || a.title.localeCompare(b.title));
  const pendingOfferRecords = offers.filter(offer => {
    const status = String(offer.status || "").toLowerCase();
    const candidateStatus = String(offer.candidateStatus || "").toLowerCase();
    return status.includes("pending") || candidateStatus.includes("pending");
  });
  const offerStageApplications = activeApplications.filter(app => app.stage === "Offer");
  const pendingOfferApplicationIds = new Set([
    ...pendingOfferRecords.map(offer => offer.applicationId).filter(Boolean),
    ...offerStageApplications.map(app => app.id).filter(Boolean),
  ]);
  const pendingOfferCount = pendingOfferApplicationIds.size;
  const pendingOfferRows = [...pendingOfferApplicationIds]
    .map(applicationId => {
      const app = applications.find(item => item.id === applicationId);
      const candidate = app ? candidateById.get(app.candidateId) : null;
      const job = app ? jobById.get(app.jobId) : null;
      const offer = pendingOfferRecords.find(item => item.applicationId === applicationId);
      return {
        id: applicationId,
        candidateName: candidate?.name || "Candidate",
        roleTitle: job?.title || "Unassigned role",
        entity: job?.entity || "Unassigned entity",
        department: job?.dept || "Unassigned department",
        recruiter: resolveRecruiterName(app, job),
        stage: app?.stage || "Offer",
        offerStatus: offer?.status || (app?.stage === "Offer" ? "In Offer stage" : "Pending"),
        candidateStatus: offer?.candidateStatus || "Pending candidate",
        createdDate: offer?.createdDate || app?.lastActivityAt || app?.appliedDate,
        candidate,
        app,
        job,
        offer,
      };
    })
    .sort((a, b) => String(b.createdDate || "").localeCompare(String(a.createdDate || "")) || a.candidateName.localeCompare(b.candidateName));
  const scheduledInterviews = interviews.filter(interview => interview.status === "Scheduled");
  const interviewRows = scheduledInterviews
    .map(interview => {
      const app = applications.find(item => item.id === interview.applicationId);
      const candidate = app ? candidateById.get(app.candidateId) : null;
      const job = app ? jobById.get(app.jobId) : null;
      return {
        id: interview.id,
        candidateName: candidate?.name || interview.candidateName || "Candidate",
        roleTitle: job?.title || interview.jobTitle || "Unassigned role",
        department: job?.dept || "Unassigned department",
        entity: job?.entity || "Unassigned entity",
        recruiter: resolveRecruiterName(app, job),
        interviewer: interview.interviewer || interview.interviewerName || "Unassigned",
        interviewType: interview.type || interview.interviewType || "Interview",
        scheduledAt: interview.scheduledAt,
        status: interview.status || "Scheduled",
        candidate,
        app,
        job,
      };
    })
    .sort((a, b) => String(a.scheduledAt || "").localeCompare(String(b.scheduledAt || "")) || a.candidateName.localeCompare(b.candidateName));
  const hiredApplications = applications.filter(app => app.stage === "Hired");
  const hiresThisMonth = hiredApplications.filter(app => {
    const dateValue = app.hiredAt || app.closedAt || app.updatedAt || app.lastActivityAt;
    return dateValue ? isThisMonth(dateValue) : true;
  });
  const newJoinerRows = hiresThisMonth
    .map(app => {
      const candidate = candidateById.get(app.candidateId);
      const job = jobById.get(app.jobId);
      return {
        id: app.id,
        candidateName: candidate?.name || "Candidate",
        roleTitle: job?.title || "Unassigned role",
        entity: job?.entity || "Unassigned entity",
        department: job?.dept || "Unassigned department",
        recruiter: resolveRecruiterName(app, job),
        hireDate: app.hiredAt || app.closedAt || app.updatedAt || app.lastActivityAt || app.appliedDate,
        candidate,
        app,
        job,
      };
    })
    .sort((a, b) => String(b.hireDate || "").localeCompare(String(a.hireDate || "")) || a.candidateName.localeCompare(b.candidateName));
  const fillDurations = hiredApplications
    .map(app => {
      const start = parseDate(app.appliedDate || app.appliedAt);
      const end = parseDate(app.hiredAt || app.closedAt || app.updatedAt || app.lastActivityAt);
      if (!start || !end || end < start) return null;
      return Math.round((end - start) / 86400000);
    })
    .filter(days => Number.isFinite(days));
  const avgTimeToFill = fillDurations.length
    ? Math.round(fillDurations.reduce((sum, days) => sum + days, 0) / fillDurations.length)
    : null;
  const openPlannedVacancies = openJobs.reduce((sum, job) => sum + (Number(job.headcount) || 1), 0);
  const totalFilledVacancies = hiredApplications.length;
  const hiringVsPlanRate = openPlannedVacancies > 0
    ? Math.min(100, Math.round((totalFilledVacancies / openPlannedVacancies) * 100))
    : totalFilledVacancies > 0 ? 100 : null;
  const offerAcceptanceRows = offers
    .map((offer, index) => {
      const app = applications.find(item => item.id === offer.applicationId);
      const candidate = app ? candidateById.get(app.candidateId) : offer.cand || offer.candidate || null;
      const job = app ? jobById.get(app.jobId) : offer.job || null;
      const candidateStatus = String(offer.candidateStatus || "").toLowerCase();
      const offerStatus = String(offer.status || "").toLowerCase();
      const isAccepted = candidateStatus === "accepted" || offerStatus === "accepted";
      const isDeclined = ["rejected", "declined"].includes(candidateStatus) || ["rejected", "declined", "withdrawn"].includes(offerStatus);
      if (!isAccepted && !isDeclined) return null;
      const decision = isAccepted ? "Accepted" : "Declined";
      const candidateName = candidate?.name || offer.candidateName || "";
      const roleTitle = job?.title || offer.jobTitle || offer.roleTitle || "";
      const department = job?.dept || offer.department || "";
      const entity = job?.entity || offer.entity || "";
      const recruiter = resolveRecruiterName(app, job);
      const isOrphanTestOffer =
        String(recruiter || "").trim().toLowerCase() === "ai testing" ||
        (!app && isPlaceholderOfferValue(candidateName) && isPlaceholderOfferValue(roleTitle) && isPlaceholderOfferValue(department) && isPlaceholderOfferValue(entity));
      if (isOrphanTestOffer) return null;
      return {
        id: offer.id || offer.applicationId || `${decision}-${candidateName || offer.candidateId || index}`,
        candidateName: candidateName || "Candidate",
        roleTitle: roleTitle || "Unassigned role",
        department: department || "Unassigned department",
        entity: entity || "Unassigned entity",
        recruiter,
        decision,
        offerStatus: offer.status || decision,
        candidateStatus: offer.candidateStatus || decision,
        decisionDate: offer.respondedAt || offer.responseDate || offer.updatedAt || offer.createdDate || app?.lastActivityAt,
        candidate,
        app,
        job,
        offer,
      };
    })
    .filter(Boolean)
    .sort((a, b) => String(b.decisionDate || "").localeCompare(String(a.decisionDate || "")) || a.candidateName.localeCompare(b.candidateName));
  const acceptedOffers = offerAcceptanceRows.filter(row => row.decision === "Accepted").length;
  const declinedOffers = offerAcceptanceRows.filter(row => row.decision === "Declined").length;
  const decidedOffers = acceptedOffers + declinedOffers;
  const offerAcceptanceRate = decidedOffers > 0 ? Math.round((acceptedOffers / decidedOffers) * 100) : null;
  const chartColors = ["#fbbf24", "#10b981", "#3b82f6", "#f87171", "#8b5cf6", "#14b8a6", "#f97316"];
  const sourceMap = new Map();
  const sourceApplications = hiredApplications.length ? hiredApplications : activeApplications;
  sourceApplications.forEach(app => {
    const candidate = candidateById.get(app.candidateId);
    const source = candidate?.source || "Unknown";
    sourceMap.set(source, (sourceMap.get(source) || 0) + 1);
  });
  const sourceRows = [...sourceMap.entries()]
    .map(([source, count], index) => ({ source, count, color: chartColors[index % chartColors.length] }))
    .sort((a, b) => b.count - a.count || a.source.localeCompare(b.source));
  const sourceTotal = sourceRows.reduce((sum, row) => sum + row.count, 0);
  const pointOnCircle = (center, radius, angle) => {
    const radians = (angle * Math.PI) / 180;
    return {
      x: center + radius * Math.cos(radians),
      y: center + radius * Math.sin(radians),
    };
  };
  const sourcePieSlices = (() => {
    let angle = -90;
    return sourceRows.map(row => {
      const percent = sourceTotal ? (row.count / sourceTotal) * 100 : 0;
      const sweep = (percent / 100) * 360;
      const startAngle = angle;
      const endAngle = angle + sweep;
      const midAngle = startAngle + sweep / 2;
      angle = endAngle;
      const start = pointOnCircle(90, 82, startAngle);
      const end = pointOnCircle(90, 82, endAngle);
      const label = pointOnCircle(90, percent < 10 ? 62 : 54, midAngle);
      const largeArc = sweep > 180 ? 1 : 0;
      return {
        ...row,
        percent: Math.round(percent),
        d: sweep >= 359.99
          ? null
          : `M 90 90 L ${start.x.toFixed(2)} ${start.y.toFixed(2)} A 82 82 0 ${largeArc} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)} Z`,
        labelX: label.x,
        labelY: label.y,
      };
    });
  })();

  const health = {
    green: { label: "Healthy", className: "health-green" },
    yellow: { label: "Attention", className: "health-yellow" },
    red: { label: "Critical", className: "health-red" },
  };
  const openReqHealth = openJobs.length === 0 ? health.yellow : health.green;
  const activeCandidateHealth = openJobs.length > 0 && activeCandidateIds.size === 0 ? health.red : activeCandidateIds.size < openJobs.length ? health.yellow : health.green;
  const interviewsHealth = activeApplications.length > 0 && scheduledInterviews.length === 0 ? health.yellow : health.green;
  const offersHealth = pendingOfferCount >= 5 ? health.red : pendingOfferCount > 0 ? health.yellow : health.green;
  const hiresHealth = openJobs.length > 0 && hiresThisMonth.length === 0 ? health.yellow : health.green;
  const fillHealth = avgTimeToFill === null ? health.yellow : avgTimeToFill > 60 ? health.red : avgTimeToFill > 45 ? health.yellow : health.green;
  const hiringVsPlanHealth = hiringVsPlanRate === null ? health.yellow : hiringVsPlanRate >= 80 ? health.green : hiringVsPlanRate >= 50 ? health.yellow : health.red;
  const offerAcceptanceHealth = offerAcceptanceRate === null ? health.yellow : offerAcceptanceRate >= 80 ? health.green : offerAcceptanceRate >= 50 ? health.yellow : health.red;

  const kpis = [
    { label: "Open requisitions", value: openJobs.length, note: `${jobs.length} total requisitions`, action: openJobs.length === 0 ? "Confirm whether hiring plan is current." : "Click to view open requisitions.", health: openReqHealth, modalType: "openRequisitions" },
    { label: "Scheduled interviews", value: scheduledInterviews.length, note: "Interviews awaiting completion", action: scheduledInterviews.length === 0 && activeApplications.length > 0 ? "Click to schedule next interviews." : "Click to review scheduled interview load.", health: interviewsHealth, modalType: "interviewsThisWeek" },
    { label: "Pending offers", value: pendingOfferCount, note: `${offerStageApplications.length} in Offer stage · ${pendingOfferRecords.length} pending records`, action: pendingOfferCount > 0 ? "Click to view pending offers." : "No offer approvals waiting.", health: offersHealth, modalType: "pendingOffers" },
    { label: "Hires YTD", value: hiresThisMonth.length, note: `${hiredApplications.length} total hired records`, action: hiresThisMonth.length === 0 && openJobs.length > 0 ? "Check final stages and offer readiness." : "Click to view new joiners.", health: hiresHealth, modalType: "newJoiners" },
    { label: "Average time to fill", value: avgTimeToFill === null ? "N/A" : `${avgTimeToFill}d`, note: avgTimeToFill === null ? "Shown after dated hires exist" : "Applied date to hire date", action: avgTimeToFill === null ? "Historical dates can be incomplete." : avgTimeToFill > 45 ? "Review slow stages and handoffs." : "Hiring cycle is within target.", health: fillHealth },
    { label: "Hiring vs plan", value: hiringVsPlanRate === null ? "N/A" : `${hiringVsPlanRate}%`, note: `${totalFilledVacancies}/${openPlannedVacancies || 0} open vacancies filled`, action: hiringVsPlanRate === null ? "No open hiring plan data yet." : `${Math.max((openPlannedVacancies || 0) - totalFilledVacancies, 0)} open vacancies remaining.`, health: hiringVsPlanHealth },
    { label: "Offer acceptance rate", value: offerAcceptanceRate === null ? "N/A" : `${offerAcceptanceRate}%`, note: `${acceptedOffers} accepted · ${declinedOffers} declined`, action: offerAcceptanceRate === null ? "Awaiting accepted or declined offers." : "Click to view accepted and declined offers.", health: offerAcceptanceHealth, modalType: "offerAcceptance" },
  ];

  const funnelDefinitions = [
    { label: "Applied/New", stages: ["Applied"] },
    { label: "Screening", stages: ["HR Screening", "HM Review"] },
    { label: "HR Interview", stages: ["1st Interview"] },
    { label: "Technical Interview", stages: ["Technical Interview"] },
    { label: "Final/EXCOM/CEO", stages: ["Final Interview"] },
    { label: "Offer", stages: ["Offer"] },
    { label: "Hired", stages: ["Hired"] },
    { label: "Rejected", stages: ["Rejected"] },
  ];
  const funnelRows = funnelDefinitions.map(item => ({
    ...item,
    count: applications.filter(app => item.stages.includes(app.stage)).length,
  }));
  const maxFunnel = Math.max(...funnelRows.map(row => row.count), 1);
  const activeFunnelRows = funnelRows.filter(row => !["Hired", "Rejected"].includes(row.label));
  const bottleneck = activeFunnelRows.reduce((max, row) => row.count > max.count ? row : max, { label: "None", count: 0 });

  const normalizePlanDepartment = (dept) => {
    const label = (dept || "Unassigned").trim() || "Unassigned";
    const key = label.toLowerCase();
    if (key === "development") return "Business Development";
    if (key === "o&m office" || key === "o&m distribution") return "O&M";
    return label;
  };

  const planMap = new Map();
  jobs.forEach(job => {
    const key = normalizePlanDepartment(job.dept);
    const current = planMap.get(key) || {
      department: key,
      entities: new Set(),
      plannedReqs: 0,
      plannedRoles: 0,
      open: 0,
      filled: 0,
    };
    current.entities.add(job.entity || "Unassigned");
    current.plannedReqs += 1;
    current.plannedRoles += Number(job.headcount) || 1;
    if (job.status === "Open") current.open += 1;
    planMap.set(key, current);
  });
  hiredApplications.forEach(app => {
    const job = jobById.get(app.jobId);
    const key = normalizePlanDepartment(job?.dept);
    const current = planMap.get(key) || {
      department: key,
      entities: new Set(),
      plannedReqs: 0,
      plannedRoles: 0,
      open: 0,
      filled: 0,
    };
    current.entities.add(job?.entity || "Unassigned");
    current.filled += 1;
    planMap.set(key, current);
  });
  const planRows = [...planMap.values()]
    .map(row => ({
      ...row,
      entityList: [...row.entities].sort().join(", "),
      remaining: Math.max(row.plannedRoles - row.filled, 0),
      progress: row.plannedRoles ? Math.min(100, Math.round((row.filled / row.plannedRoles) * 100)) : row.filled > 0 ? 100 : 0,
    }))
    .sort((a, b) => a.department.localeCompare(b.department));
  const planTotalVacancies = planRows.reduce((sum, row) => sum + row.plannedRoles, 0);
  const planFilledVacancies = planRows.reduce((sum, row) => sum + row.filled, 0);
  const planOpenVacancies = planRows.reduce((sum, row) => sum + row.remaining, 0);
  const planOverallAchievement = planTotalVacancies > 0
    ? Math.round((planFilledVacancies / planTotalVacancies) * 100)
    : planFilledVacancies > 0 ? 100 : 0;
  const topPlanRows = [...planRows]
    .sort((a, b) => b.plannedRoles - a.plannedRoles || a.department.localeCompare(b.department))
    .slice(0, 12);
  const planChartMaxRaw = Math.max(...topPlanRows.map(row => row.plannedRoles), 1);
  const planChartMax = Math.max(4, Math.ceil(planChartMaxRaw / 2) * 2);
  const planAxisTicks = Array.from({ length: 9 }, (_, index) => Math.round((planChartMax / 8) * index));
  const achievementStatus = progress => progress >= 80
    ? { label: "Green", className: "achievement-green", dotClass: "dot-green" }
    : progress >= 50
      ? { label: "Yellow", className: "achievement-yellow", dotClass: "dot-amber" }
      : { label: "Red", className: "achievement-red", dotClass: "dot-red" };

  const recruiterMap = new Map();
  const ensureRecruiter = (name) => {
    const key = name || "Unassigned";
    if (!recruiterMap.has(key)) {
      recruiterMap.set(key, { recruiter: key, openReqs: 0, activeCandidates: 0, interviewsThisWeek: 0, hiresThisMonth: 0 });
    }
    return recruiterMap.get(key);
  };
  openJobs.forEach(job => {
    ensureRecruiter(resolveRecruiterName(null, job)).openReqs += 1;
  });
  activeApplications.forEach(app => {
    const job = jobById.get(app.jobId);
    const row = ensureRecruiter(resolveRecruiterName(app, job));
    row.activeCandidates += 1;
  });
  scheduledInterviews.forEach(interview => {
    const app = applications.find(item => item.id === interview.applicationId);
    const job = app ? jobById.get(app.jobId) : null;
    ensureRecruiter(resolveRecruiterName(app, job)).interviewsThisWeek += 1;
  });
  hiresThisMonth.forEach(app => {
    const job = jobById.get(app.jobId);
    ensureRecruiter(resolveRecruiterName(app, job)).hiresThisMonth += 1;
  });
  const recruiterRows = [...recruiterMap.values()].sort((a, b) => {
    const totalA = a.openReqs + a.activeCandidates + a.interviewsThisWeek + a.hiresThisMonth;
    const totalB = b.openReqs + b.activeCandidates + b.interviewsThisWeek + b.hiresThisMonth;
    return totalB - totalA || a.recruiter.localeCompare(b.recruiter);
  });

  const renderHealth = (item) => (
    <span className="health-pill">
      <span className={`health-dot ${item.health.className}`} />
      {item.health.label}
    </span>
  );
  const openKpiModal = (item) => {
    if (!item.modalType) return;
    const payloads = {
      openRequisitions: { rows: openRequisitionRows, totalRequisitions: jobs.length },
      interviewsThisWeek: { rows: interviewRows, activeApplications: activeApplications.length },
      pendingOffers: { rows: pendingOfferRows, offerStageCount: offerStageApplications.length, pendingRecordCount: pendingOfferRecords.length },
      newJoiners: { rows: newJoinerRows, totalHired: hiredApplications.length },
      offerAcceptance: { rows: offerAcceptanceRows, accepted: acceptedOffers, declined: declinedOffers, rate: offerAcceptanceRate },
    };
    openModal?.(item.modalType, payloads[item.modalType] || {});
  };
  const kpiTitle = (item) => {
    if (item.modalType === "openRequisitions") return "View open requisitions";
    if (item.modalType === "interviewsThisWeek") return "View scheduled interviews";
    if (item.modalType === "pendingOffers") return "View pending offers";
    if (item.modalType === "newJoiners") return "View new joiners";
    if (item.modalType === "offerAcceptance") return "View offer acceptance details";
    return undefined;
  };

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Karm. ATS Dashboard</div>
        </div>
      </div>
      <div className="page-content">
        <div className="chart-dashboard-grid">
          <section className="chart-card chart-card-wide">
            <div className="chart-card-head">
              <div>
                <div className="chart-card-title">Overall Progress Tracking</div>
                <div className="chart-card-sub">Live hiring signals from current requisitions, interviews, offers, and hires.</div>
              </div>
            </div>
            <div className="chart-metric-grid">
              <button className="chart-metric btn-reset" onClick={() => setPage?.("jobs")} title="View job requisitions">
                <div className="chart-metric-value" style={{ color: "var(--accent)" }}>{trackedPositionCount}</div>
                <div className="chart-metric-label">Positions</div>
                <div className="chart-metric-breakdown">{openJobs.length} open · {closedJobs.length} closed</div>
              </button>
              <button className="chart-metric btn-reset" onClick={() => openKpiModal(kpis[1])} title="View scheduled interviews">
                <div className="chart-metric-value" style={{ color: "var(--amber)" }}>{scheduledInterviews.length}</div>
                <div className="chart-metric-label">Scheduled interviews</div>
              </button>
              <button className="chart-metric btn-reset" onClick={() => openKpiModal(kpis[2])} title="View pending offers">
                <div className="chart-metric-value" style={{ color: "var(--green)" }}>{pendingOfferCount}</div>
                <div className="chart-metric-label">Pending offers</div>
              </button>
              <button className="chart-metric btn-reset" onClick={() => openKpiModal(kpis[3])} title="View new joiners">
                <div className="chart-metric-value" style={{ color: "var(--accent)" }}>{hiresThisMonth.length}</div>
                <div className="chart-metric-label">Hires YTD</div>
              </button>
            </div>
            <div className="chart-metric-grid chart-metric-grid-secondary">
              <div className="chart-metric">
                <div className="chart-metric-value" style={{ color: "var(--text)" }}>{avgTimeToFill === null ? "N/A" : `${avgTimeToFill}d`}</div>
                <div className="chart-metric-label">Average time to fill</div>
              </div>
              <div className="chart-metric">
                <div className="chart-metric-value" style={{ color: "var(--text)" }}>{hiringVsPlanRate === null ? "N/A" : `${hiringVsPlanRate}%`}</div>
                <div className="chart-metric-label">Hiring vs plan · {totalFilledVacancies}/{openPlannedVacancies || 0} vacancies filled</div>
              </div>
            </div>
          </section>

          <section className="chart-card">
            <div className="chart-card-head">
              <div>
                <div className="chart-card-title">Offer Acceptance</div>
                <div className="chart-card-sub">{acceptedOffers} accepted · {declinedOffers} declined</div>
              </div>
              {renderHealth(kpis[6])}
            </div>
            <button className="btn-reset donut-wrap" onClick={() => openKpiModal(kpis[6])} title="View offer acceptance details">
              <div className="donut-chart" style={{ background: offerAcceptanceRate === null ? "var(--bg4)" : `conic-gradient(var(--green) 0 ${offerAcceptanceRate}%, var(--red) ${offerAcceptanceRate}% 100%)` }}>
                <div className="donut-center">
                  <div>
                    <div className="donut-value">{offerAcceptanceRate === null ? "N/A" : `${offerAcceptanceRate}%`}</div>
                    <div className="donut-label">Accepted</div>
                  </div>
                </div>
              </div>
              <div className="chart-legend">
                <span><i className="dot dot-green" /> Accepted</span>
                <span><i className="dot dot-red" /> Declined</span>
              </div>
            </button>
          </section>

          <section className="chart-card">
            <div className="chart-card-head">
              <div>
                <div className="chart-card-title">Talent Source Mix</div>
                <div className="chart-card-sub">{hiredApplications.length ? "Hired candidates by source" : "Active candidates by source"}</div>
              </div>
            </div>
            {sourceRows.length === 0 ? (
              <div className="empty-panel">No source data yet.</div>
            ) : (
              <>
                <svg className="pie-chart-svg" viewBox="0 0 180 180" role="img" aria-label="Talent source mix percentages">
                  {sourcePieSlices.map(row => (
                    row.d ? (
                      <path className="pie-slice" key={row.source} d={row.d} fill={row.color} />
                    ) : (
                      <circle className="pie-slice" key={row.source} cx="90" cy="90" r="82" fill={row.color} />
                    )
                  ))}
                  {sourcePieSlices.map(row => (
                    <text className="pie-label" key={`${row.source}-label`} x={row.labelX} y={row.labelY}>
                      {row.percent}%
                    </text>
                  ))}
                </svg>
                <div className="compact-list">
                  {sourceRows.slice(0, 5).map(row => (
                    <div className="compact-row" key={row.source}>
                      <span className="source-name"><i className="dot" style={{ background: row.color }} /> {row.source}</span>
                      <span className="source-count">{Math.round((row.count / sourceTotal) * 100)}%</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>

          <section className="chart-card chart-card-full plan-achievement-card">
            <div className="plan-achievement-head">
              <div>
                <div className="plan-achievement-title">Hiring Plan Achievement by Department</div>
                <div className="plan-achievement-sub">Vacancies planned vs filled · June 2026</div>
              </div>
              <div className="plan-legend" aria-label="Hiring plan chart legend">
                <span><i className="plan-legend-box plan-legend-planned" /> Planned</span>
                <span><i className="plan-legend-box plan-legend-filled" /> Filled</span>
              </div>
            </div>
            {planRows.length === 0 ? (
              <div className="empty-panel">No hiring plan data yet. Achievement will appear once requisitions or hires exist.</div>
            ) : (
              <>
                <div className="plan-summary-grid">
                  <div className="plan-summary-card">
                    <div className="plan-summary-label">Total vacancies</div>
                    <div className="plan-summary-value">{planTotalVacancies}</div>
                  </div>
                  <div className="plan-summary-card">
                    <div className="plan-summary-label">Filled</div>
                    <div className="plan-summary-value">{planFilledVacancies}</div>
                  </div>
                  <div className="plan-summary-card">
                    <div className="plan-summary-label">Open</div>
                    <div className="plan-summary-value open">{planOpenVacancies}</div>
                  </div>
                  <div className="plan-summary-card">
                    <div className="plan-summary-label">Overall achievement</div>
                    <div className="plan-summary-value percent">{planOverallAchievement}%</div>
                  </div>
                </div>
                <div className="plan-bars-plot">
                  {topPlanRows.map(row => {
                    const plannedWidth = Math.max(2, Math.round((row.plannedRoles / planChartMax) * 100));
                    const filledWidth = row.filled === 0 ? 0 : Math.max(2, Math.round((row.filled / planChartMax) * 100));
                    return (
                      <div className="plan-plot-row" key={row.department}>
                        <div className="plan-plot-label">{row.department}</div>
                        <div className="plan-plot-area" aria-label={`${row.department}: ${row.plannedRoles} planned, ${row.filled} filled, ${row.remaining} open`}>
                          <div className="plan-bar planned" style={{ width: `${plannedWidth}%` }} />
                          <div className="plan-bar filled" style={{ width: `${filledWidth}%` }} />
                          <div className="plan-bar-note">{row.progress}% · {row.remaining} open</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="plan-axis">
                  <div />
                  <div className="plan-axis-scale">
                    {planAxisTicks.map((tick, index) => <span key={`${tick}-${index}`}>{tick}</span>)}
                  </div>
                  <div className="plan-axis-label">Number of positions</div>
                </div>
              </>
            )}
          </section>

          <section className="chart-card chart-card-wide">
            <div className="chart-card-head">
              <div>
                <div className="chart-card-title">Recruitment Funnel</div>
                <div className="chart-card-sub">Stage volume highlights where candidates are collecting.</div>
              </div>
              {bottleneck.count > 0 && <span className="badge badge-amber">Largest: {bottleneck.label}</span>}
            </div>
            {applications.length === 0 ? (
              <div className="empty-panel">No candidate pipeline records are available yet.</div>
            ) : (
              <div className="funnel-stack">
                {funnelRows.map((row, index) => (
                  <div className="funnel-stack-row" key={row.label}>
                    <div className="funnel-stack-stage">{row.label}</div>
                    <div className="funnel-stack-track">
                      <div
                        className="funnel-stack-fill"
                        style={{
                          width: row.count === 0 ? 0 : `${Math.max(4, Math.round((row.count / maxFunnel) * 100))}%`,
                          background: row.label === "Hired" ? "var(--teal)" : chartColors[index % chartColors.length],
                        }}
                      />
                    </div>
                    <div className="funnel-stack-count">{row.count}</div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="chart-card">
            <div className="chart-card-head">
              <div>
                <div className="chart-card-title">Recruiter Workload</div>
                <div className="chart-card-sub">Top ownership load by active candidates.</div>
              </div>
            </div>
            {recruiterRows.length === 0 ? (
              <div className="empty-panel">No recruiter workload is available yet.</div>
            ) : (
              <div className="compact-list">
                {recruiterRows.slice(0, 5).map(row => (
                  <div className="compact-row" key={row.recruiter}>
                    <div>
                      <div className="strong">{row.recruiter}</div>
                      <div className="source-name">{row.openReqs} open reqs · {row.interviewsThisWeek} interviews</div>
                    </div>
                    <span className="badge badge-blue">{row.activeCandidates} candidates</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </>
  );
}

// ── HIRING REQUESTS ───────────────────────────────────────────────────────────
function HiringRequestsPage({ hiringRequests, setHiringRequests, currentRole, roleConfig, openModal, backendActions, reloadData, candidates = [] }) {
  const canRequest = currentRole === "Admin" || currentRole === "Recruiter" || currentRole === "Hiring Manager";
  const [savingId, setSavingId] = useState("");

  const approveStep = async (id) => {
    try {
      setSavingId(id);
      if (backendActions?.approveHiringRequestStep) {
        const updated = await backendActions.approveHiringRequestStep(id);
        const mapped = mapHiringRequest(updated);
        setHiringRequests(prev => prev.map(req => (req.id === id ? { ...req, ...mapped } : req)));
        await reloadData?.();
        return;
      }
      setHiringRequests(prev => prev.map(req => {
        if (req.id !== id) return req;
        if (!req.managerApproved) return { ...req, managerApproved: true, status: "Pending HR Approval" };
        if (!req.hrApproved) return { ...req, hrApproved: true, status: "Pending Admin Approval" };
        if (!req.ceoApproved) return { ...req, ceoApproved: true, status: "Approved" };
        return req;
      }));
    } catch (error) {
      window.alert(`Could not approve this hiring request: ${error.message || "Unknown error"}`);
    } finally {
      setSavingId("");
    }
  };

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Hiring Requests</div>
          <div className="page-sub">Request new hires before creating requisitions</div>
        </div>
        {canRequest && <button className="btn btn-primary" onClick={() => openModal("addHiringRequest")}><Icon name="plus" size={14} /> Request New Hire</button>}
      </div>
      <div className="page-content">
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header">
            <div className="card-title">Approval flow</div>
          </div>
          <div className="card-body">
            <div className="offer-steps">
              {["Manager submits", "HR reviews", "Admin approves", "Create requisition"].map((label, i) => (
                <div key={label} style={{ display: "flex", alignItems: "center", flex: 1 }}>
                  <div className={`offer-step ${i < 1 ? "done" : i === 1 ? "active" : ""}`} style={{ flex: "none" }}>
                    <div className="offer-step-num">{i + 1}</div>
                    <span style={{ fontSize: 11, marginLeft: 6, whiteSpace: "nowrap" }}>{label}</span>
                  </div>
                  {i < 3 && <div className="offer-connector" />}
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead><tr><th>Role</th><th>Entity</th><th>Requested by</th><th>Reason</th><th>Approvals</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {hiringRequests.map(req => {
                  const canApproveStep = canApproveHiringRequestStep(req, currentRole, roleConfig);
                  return (
                    <tr key={req.id}>
                      <td className="strong">{req.title}<div style={{ fontSize: 11, color: "var(--text3)" }}>{req.dept}</div></td>
                      <td><span className="tag">{req.entity}</span></td>
                      <td>{req.requestedBy}</td>
                      <td style={{ maxWidth: 260 }}>{req.reason}</td>
                      <td>
                        <span className={`badge ${req.managerApproved ? "badge-green" : "badge-amber"}`}>Manager</span>{" "}
                        <span className={`badge ${req.hrApproved ? "badge-green" : "badge-amber"}`}>HR</span>{" "}
                        <span className={`badge ${req.ceoApproved ? "badge-green" : "badge-amber"}`}>Admin</span>
                      </td>
                      <td><span className={`badge ${req.status === "Approved" ? "badge-green" : "badge-amber"}`}>{req.status}</span></td>
                      <td>{canApproveStep && <button className="btn btn-ghost btn-sm" onClick={() => approveStep(req.id)} disabled={savingId === req.id}>{savingId === req.id ? "Saving..." : hiringRequestApprovalButtonLabel(req)}</button>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}

// ── JOBS PAGE ─────────────────────────────────────────────────────────────────
// ── EXCEL EXPORT UTILITY ──────────────────────────────────────────────────────
function exportToCSV(filename, headers, rows) {
  const escape = (val) => {
    const s = val == null ? "" : String(val);
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [
    headers.map(escape).join(","),
    ...rows.map(row => row.map(escape).join(",")),
  ].join("\n");
  const BOM = "\uFEFF"; // UTF-8 BOM for Excel Arabic/special char support
  const blob = new Blob([BOM + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function ExportButton({ onClick }) {
  const [flash, setFlash] = useState(false);
  const handle = () => {
    onClick();
    setFlash(true);
    setTimeout(() => setFlash(false), 1800);
  };
  return (
    <button
      className="btn btn-ghost"
      onClick={handle}
      style={flash ? { borderColor: "var(--green)", color: "var(--green)", background: "var(--green-soft)" } : {}}
    >
      {flash
        ? <><Icon name="check" size={14} /> Exported!</>
        : <><Icon name="download" size={14} /> Export Excel</>}
    </button>
  );
}


// ── MANPOWER PLAN IMPORTER ────────────────────────────────────────────────────
function ManpowerPlanImporter({ closeModal, jobs, setJobs, backendActions, reloadData }) {
  const [phase, setPhase] = useState("drop"); // drop | parsing | review | done
  const [dragOver, setDragOver] = useState(false);
  const [parsedJobs, setParsedJobs] = useState([]);
  const [error, setError] = useState("");
  const [importing, setImporting] = useState(false);

  const readFile = (file) => new Promise((res, rej) => {
    const reader = new FileReader();
    if (file.name.endsWith(".csv") || file.type === "text/csv" || file.type === "text/plain") {
      reader.onload = () => res({ text: reader.result, type: "text" });
      reader.onerror = rej;
      reader.readAsText(file);
    } else {
      // For xlsx/xls we create an editable draft row in the browser.
      reader.onload = () => res({ b64: reader.result.split(",")[1], type: "binary", name: file.name, mime: file.type || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      reader.onerror = rej;
      reader.readAsDataURL(file);
    }
  });

  const splitCsvLine = (line) => {
    const cells = [];
    let cur = "";
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; continue; }
      if (ch === '"') { quoted = !quoted; continue; }
      if (ch === "," && !quoted) { cells.push(cur.trim()); cur = ""; continue; }
      cur += ch;
    }
    cells.push(cur.trim());
    return cells;
  };

  const cleanFileTitle = (name) => name
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\b(cv|resume|manpower|plan|approved)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  const normalizePlanEntity = (entity) => {
    const e = `${entity || ""}`.toLowerCase();
    if (e.includes("egypt")) return "Karm Egypt";
    if (e.includes("cyprus")) return "Karm Cyprus";
    if (e.includes("tunisia")) return "Karm Tunisia";
    if (e.includes("nl") || e.includes("netherlands")) return "Sub HoldCo. (NL)";
    if (e.includes("uk")) return "HoldCo. (UK)";
    return entity || "Karm Egypt";
  };

  const parseHeadcountFromPlanRow = (rowObj) => {
    const direct = parseInt(rowObj.headcount || rowObj.hc || rowObj["total hc"] || rowObj.count || 0);
    if (direct) return direct;
    const quarters = ["q1", "q2", "q3", "q4"].map(k => Number(rowObj[k]) || 0);
    const quarterSum = quarters.reduce((sum, n) => sum + n, 0);
    if (quarterSum) return quarterSum;
    const months = Object.keys(rowObj).filter(k => /^p\d+/i.test(k)).map(k => Number(rowObj[k]) || 0);
    const maxMonth = Math.max(...months, 0);
    return maxMonth || 1;
  };

  const normalizeImportedJob = (j, i, today) => ({
    id: `import_${Date.now()}_${i}`,
    title: j.title || j["job title"] || j.role || j.position || "Imported Position",
    dept: j.dept || j.department || DEPARTMENTS[0],
    entity: normalizePlanEntity(j.entity),
    positionType: POSITION_TYPES.includes(j.positionType || j["position type"]) ? (j.positionType || j["position type"]) : "Manpower",
    level: JOB_FAMILIES.includes(j.level || j["job family"]) ? (j.level || j["job family"]) : "Staff",
    headcount: parseHeadcountFromPlanRow(j),
    salaryMin: parseFloat(j.salaryMin || j["salary min"] || j.min || 0) || 0,
    salaryMax: parseFloat(j.salaryMax || j["salary max"] || j.max || 0) || 0,
    status: j.status || "Open",
    description: j.description || "",
    openDate: today,
    recruiter: "Islam Ahmed",
    hiringManager: j.hiringManager || j["hiring manager"] || "",
    approvedBy: j.approvedBy || j["approved by"] || "Samia Salaheldin",
    approvalDate: j.approvalDate || j["approval date"] || today,
    _selected: true,
    _error: null,
  });

  const parseManpowerLocally = async (file) => {
    const fileData = await readFile(file);
    const today = new Date().toISOString().split("T")[0];
    if (file.name.match(/\.xlsx?$/i)) {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
      if (rows.length >= 2) {
        const headers = rows[0].map((h, idx) => `${h || (idx === 4 ? "hiring manager" : `col_${idx}`)}`.toLowerCase().trim());
        const parsedRows = rows.slice(1).map(row => {
          const obj = {};
          headers.forEach((h, idx) => { obj[h] = row[idx]; });
          return {
            title: obj["job title"] || obj.title || obj.role || row[0],
            dept: obj.department || obj.dept || row[3],
            entity: obj.entity || row[2],
            positionType: obj["position type"] || obj["contract type"] || "Manpower",
            level: obj["job family"] || obj.level || "Staff",
            headcount: parseHeadcountFromPlanRow(obj),
            hiringManager: obj["hiring manager"] || row[4],
            description: obj.description || "",
            status: obj.status || "Open",
          };
        }).filter(row => row.title && `${row.title}`.toLowerCase() !== "job title");
        if (parsedRows.length) return parsedRows.map((row, i) => normalizeImportedJob(row, i, today));
      }
    }
    if (fileData.type === "text") {
      const lines = fileData.text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      if (lines.length >= 2) {
        const headers = splitCsvLine(lines[0]).map(h => h.toLowerCase().trim());
        const rows = lines.slice(1).map(line => {
          const cells = splitCsvLine(line);
          return headers.reduce((obj, h, idx) => ({ ...obj, [h]: cells[idx] || "" }), {});
        }).filter(row => Object.values(row).some(Boolean));
        if (rows.length) return rows.map((row, i) => normalizeImportedJob(row, i, today));
      }
    }
    return [normalizeImportedJob({ title: cleanFileTitle(file.name) || "Imported Position", description: `Draft created from ${file.name}. Review and edit before importing.` }, 0, today)];
  };

  const handleFiles = async (files) => {
    const file = files[0];
    if (!file) return;
    setError("");
    setPhase("parsing");
    try {
      const result = await parseManpowerLocally(file);
      if (!result.length) throw new Error("No jobs found in file");
      setParsedJobs(result);
      setPhase("review");
    } catch (e) {
      setError("Could not read the file. Try a CSV export, or use the draft row to enter the position manually.");
      setPhase("drop");
    }
  };

  const updateJob = (id, field, value) => {
    setParsedJobs(prev => prev.map(j => j.id === id ? { ...j, [field]: value } : j));
  };

  const toggleSelect = (id) => {
    setParsedJobs(prev => prev.map(j => j.id === id ? { ...j, _selected: !j._selected } : j));
  };

  const confirmImport = async () => {
    setImporting(true);
    setError("");
    const toImport = parsedJobs.filter(j => j._selected);
    try {
      const created = [];
      for (const { id, _selected, _error, ...job } of toImport) {
        const saved = await backendActions.createPosition(job);
        if (job.status === "Open") {
          try { await backendActions.updatePositionStatus(saved.id, "open"); } catch {}
        }
        created.push(saved);
      }
      if (reloadData) {
        await reloadData();
      } else {
        setJobs(prev => [...prev, ...toImport.map(({ id, _selected, _error, ...j }) => ({ ...j, id: Date.now() + Math.random() }))]);
      }
      setPhase("done");
    } catch (e) {
      setError(e.message || "Import failed before saving to the backend. Nothing was partially saved in this browser.");
      setPhase("review");
    } finally {
      setImporting(false);
    }
  };

  const selectedCount = parsedJobs.filter(j => j._selected).length;
  const importedDeptOptions = Array.from(new Set([...DEPARTMENTS, ...parsedJobs.map(j => j.dept).filter(Boolean)]));
  const importedEntityOptions = Array.from(new Set([...ENTITIES, ...parsedJobs.map(j => j.entity).filter(Boolean)]));
  const importedFamilyOptions = Array.from(new Set([...JOB_FAMILIES, ...parsedJobs.map(j => j.level).filter(Boolean)]));

  return (
    <div className="modal-overlay" onClick={closeModal}>
      <div className="modal" style={{ maxWidth: 820 }} onClick={e => e.stopPropagation()}>

        {/* HEADER */}
        <div className="modal-header">
          <div>
            <div className="modal-title">
              {phase === "drop" && "📋 Import Manpower Plan"}
              {phase === "parsing" && "Reading your manpower plan..."}
              {phase === "review" && `Review ${parsedJobs.length} extracted positions`}
              {phase === "done" && "✅ Import complete"}
            </div>
            <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 2 }}>
              {phase === "drop" && "Upload your approved manpower plan — Excel or CSV"}
              {phase === "review" && `${selectedCount} of ${parsedJobs.length} selected for import`}
            </div>
          </div>
          <button className="modal-close" onClick={closeModal}>×</button>
        </div>

        <div className="modal-body">

          {/* DROP ZONE */}
          {phase === "drop" && (
            <div>
              {error && <div className="alert alert-amber" style={{ marginBottom: 16 }}><Icon name="alert" size={14} />{error}</div>}
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
                onClick={() => document.getElementById("mp-file-input").click()}
                style={{
                  border: `2px dashed ${dragOver ? "var(--accent)" : "var(--border2)"}`,
                  borderRadius: "var(--radius-lg)",
                  background: dragOver ? "var(--accent-soft)" : "var(--bg3)",
                  padding: "52px 24px",
                  textAlign: "center",
                  cursor: "pointer",
                  transition: "all 0.2s",
                  marginBottom: 20,
                }}
              >
                <div style={{ fontSize: 44, marginBottom: 14 }}>📊</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text)", marginBottom: 8 }}>
                  Drop your manpower plan here
                </div>
                <div style={{ fontSize: 13, color: "var(--text3)", marginBottom: 16 }}>
                  Supports Excel (.xlsx, .xls) and CSV files
                </div>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "var(--accent)", color: "white", padding: "9px 22px", borderRadius: "var(--radius)", fontSize: 13, fontWeight: 500 }}>
                  <Icon name="plus" size={14} /> Browse file
                </div>
              </div>
              <input id="mp-file-input" type="file" accept=".xlsx,.xls,.csv,.txt" style={{ display: "none" }} onChange={e => handleFiles(e.target.files)} />

              {/* Expected format hint */}
              <div className="card">
                <div className="card-header"><div className="card-title">Expected file format</div></div>
                <div className="card-body" style={{ padding: "12px 20px" }}>
                  <p style={{ fontSize: 12, color: "var(--text2)", marginBottom: 12 }}>CSV files are parsed locally in this browser. Excel files create an editable draft row for review. For best results, export your plan as CSV with columns similar to:</p>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                      <thead>
                        <tr style={{ background: "var(--bg3)" }}>
                          {["Job Title", "Department", "Entity", "Position Type", "Job Family", "Headcount", "Salary Min", "Salary Max", "Status"].map(h => (
                            <th key={h} style={{ padding: "7px 10px", textAlign: "left", color: "var(--text3)", fontFamily: "var(--mono)", borderBottom: "1px solid var(--border)", fontWeight: 400 }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          ["Solar Engineer", "Technical Office", "Karm Egypt", "Manpower", "Staff", "2", "30000", "45000", "Open"],
                          ["BD Manager", "Business Development", "Karm Cyprus", "Additional R.", "Middle Management", "1", "50000", "70000", "Open"],
                          ["O&M Technician", "O&M Office", "Karm Egypt", "Replacement", "Blue Collar - Technicians", "4", "8000", "12000", "Open"],
                        ].map((row, i) => (
                          <tr key={i}>
                            {row.map((cell, j) => (
                              <td key={j} style={{ padding: "7px 10px", color: "var(--text2)", borderBottom: "1px solid var(--border)" }}>{cell}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p style={{ fontSize: 11, color: "var(--text3)", marginTop: 10 }}>
                    Column names do not need to match exactly. You can review and edit every extracted row before importing.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* PARSING */}
          {phase === "parsing" && (
            <div style={{ textAlign: "center", padding: "52px 24px" }}>
              <div style={{ fontSize: 44, marginBottom: 20, display: "inline-block", animation: "spin 1.2s linear infinite" }}>⚙️</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text)", marginBottom: 8 }}>Reading your manpower plan locally</div>
              <div style={{ fontSize: 13, color: "var(--text3)" }}>Preparing editable requisition rows for review...</div>
              <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
            </div>
          )}

          {/* REVIEW */}
          {phase === "review" && (
            <div>
              <div className="alert alert-info" style={{ marginBottom: 16 }}>
                <Icon name="alert" size={14} />
                <span>Review the extracted positions below. Deselect any you don't want to import, and edit any field directly.</span>
              </div>

              {/* Select all / deselect all */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => setParsedJobs(p => p.map(j => ({ ...j, _selected: true })))}>Select all</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setParsedJobs(p => p.map(j => ({ ...j, _selected: false })))}>Deselect all</button>
                </div>
                <span style={{ fontSize: 12, color: "var(--text3)", fontFamily: "var(--mono)" }}>{selectedCount} / {parsedJobs.length} selected</span>
              </div>

              <div style={{ maxHeight: 440, overflowY: "auto", border: "1px solid var(--border)", borderRadius: "var(--radius)" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead style={{ position: "sticky", top: 0, background: "var(--bg2)", zIndex: 1 }}>
                    <tr>
                      <th style={{ width: 36, padding: "10px 12px", textAlign: "center", borderBottom: "1px solid var(--border)", color: "var(--text3)", fontSize: 11 }}>✓</th>
                      <th style={{ padding: "10px 12px", textAlign: "left", borderBottom: "1px solid var(--border)", color: "var(--text3)", fontSize: 11, fontFamily: "var(--mono)" }}>JOB TITLE</th>
                      <th style={{ padding: "10px 12px", textAlign: "left", borderBottom: "1px solid var(--border)", color: "var(--text3)", fontSize: 11, fontFamily: "var(--mono)" }}>DEPARTMENT</th>
                      <th style={{ padding: "10px 12px", textAlign: "left", borderBottom: "1px solid var(--border)", color: "var(--text3)", fontSize: 11, fontFamily: "var(--mono)" }}>ENTITY</th>
                      <th style={{ padding: "10px 12px", textAlign: "left", borderBottom: "1px solid var(--border)", color: "var(--text3)", fontSize: 11, fontFamily: "var(--mono)" }}>POSITION TYPE</th>
                      <th style={{ padding: "10px 12px", textAlign: "left", borderBottom: "1px solid var(--border)", color: "var(--text3)", fontSize: 11, fontFamily: "var(--mono)" }}>JOB FAMILY</th>
                      <th style={{ padding: "10px 12px", textAlign: "left", borderBottom: "1px solid var(--border)", color: "var(--text3)", fontSize: 11, fontFamily: "var(--mono)" }}>HC</th>
                      <th style={{ padding: "10px 12px", textAlign: "left", borderBottom: "1px solid var(--border)", color: "var(--text3)", fontSize: 11, fontFamily: "var(--mono)" }}>STATUS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedJobs.map(job => (
                      <tr key={job.id} style={{ opacity: job._selected ? 1 : 0.4, transition: "opacity 0.15s" }}>
                        <td style={{ padding: "8px 12px", textAlign: "center", borderBottom: "1px solid var(--border)" }}>
                          <input type="checkbox" checked={job._selected} onChange={() => toggleSelect(job.id)} style={{ accentColor: "var(--accent)", width: 15, height: 15, cursor: "pointer" }} />
                        </td>
                        <td style={{ padding: "6px 8px", borderBottom: "1px solid var(--border)" }}>
                          <input
                            className="form-input"
                            style={{ padding: "5px 8px", fontSize: 12, minWidth: 160 }}
                            value={job.title}
                            onChange={e => updateJob(job.id, "title", e.target.value)}
                          />
                        </td>
                        <td style={{ padding: "6px 8px", borderBottom: "1px solid var(--border)" }}>
                          <select className="form-select" style={{ padding: "5px 8px", fontSize: 12 }} value={job.dept} onChange={e => updateJob(job.id, "dept", e.target.value)}>
                            {importedDeptOptions.map(d => <option key={d}>{d}</option>)}
                          </select>
                        </td>
                        <td style={{ padding: "6px 8px", borderBottom: "1px solid var(--border)" }}>
                          <select className="form-select" style={{ padding: "5px 8px", fontSize: 12 }} value={job.entity} onChange={e => updateJob(job.id, "entity", e.target.value)}>
                            {importedEntityOptions.map(en => <option key={en}>{en}</option>)}
                          </select>
                        </td>
                        <td style={{ padding: "6px 8px", borderBottom: "1px solid var(--border)" }}>
                          <select className="form-select" style={{ padding: "5px 8px", fontSize: 12 }} value={job.positionType || "Manpower"} onChange={e => updateJob(job.id, "positionType", e.target.value)}>
                            {POSITION_TYPES.map(t => <option key={t}>{t}</option>)}
                          </select>
                        </td>
                        <td style={{ padding: "6px 8px", borderBottom: "1px solid var(--border)" }}>
                          <select className="form-select" style={{ padding: "5px 8px", fontSize: 12 }} value={job.level} onChange={e => updateJob(job.id, "level", e.target.value)}>
                            {importedFamilyOptions.map(f => <option key={f}>{f}</option>)}
                          </select>
                        </td>
                        <td style={{ padding: "6px 8px", borderBottom: "1px solid var(--border)" }}>
                          <input
                            className="form-input"
                            type="number"
                            min="1"
                            style={{ padding: "5px 8px", fontSize: 12, width: 60 }}
                            value={job.headcount}
                            onChange={e => updateJob(job.id, "headcount", parseInt(e.target.value) || 1)}
                          />
                        </td>
                        <td style={{ padding: "6px 8px", borderBottom: "1px solid var(--border)" }}>
                          <select className="form-select" style={{ padding: "5px 8px", fontSize: 12 }} value={job.status} onChange={e => updateJob(job.id, "status", e.target.value)}>
                            <option>Open</option><option>Draft</option>
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* DONE */}
          {phase === "done" && (
            <div style={{ textAlign: "center", padding: "48px 24px" }}>
              <div style={{ fontSize: 52, marginBottom: 16 }}>🎉</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text)", marginBottom: 8 }}>
                {selectedCount} position{selectedCount !== 1 ? "s" : ""} imported successfully
              </div>
              <div style={{ fontSize: 13, color: "var(--text3)" }}>
                All positions are now visible in the Job Requisitions tab.
              </div>
            </div>
          )}
        </div>

        {/* FOOTER */}
        <div className="modal-footer">
          {phase === "drop" && <button className="btn btn-ghost" onClick={closeModal}>Cancel</button>}
          {phase === "parsing" && <button className="btn btn-ghost" disabled style={{ opacity: 0.4 }}>Reading file...</button>}
          {phase === "review" && (
            <>
              <button className="btn btn-ghost" onClick={closeModal}>Cancel</button>
              <button className="btn btn-ghost" onClick={() => setPhase("drop")}>← Back</button>
              <button className="btn btn-primary" onClick={confirmImport} disabled={selectedCount === 0 || importing}>
                <Icon name="check" size={14} />
                Import {selectedCount} position{selectedCount !== 1 ? "s" : ""}
              </button>
            </>
          )}
          {phase === "done" && <button className="btn btn-primary" onClick={closeModal}>Done</button>}
        </div>
      </div>
    </div>
  );
}

function JobDetailModal({ job, applications, candidates, jobs, setJobs, openModal, onClose, canEdit, canViewSalary, backendActions, reloadData }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ ...job });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const viewJob = { ...job, ...form };
  const normalizeStatus = (status) => ({
    Open: "open",
    Draft: "draft",
    Closed: "closed",
    "On Hold": "on_hold",
  }[status] || status || "");

  const jobApps = applications.filter(a => a.jobId === job.id && a.status === "Active");

  const saveEdit = async () => {
    setSaving(true);
    try {
      const nextJob = { ...job, ...form };
      if (backendActions?.updatePosition) {
        await backendActions.updatePosition(job.id, nextJob);
        if (form.status && normalizeStatus(form.status) !== normalizeStatus(job.status)) {
          await backendActions.updatePositionStatus(job.id, form.status);
        }
        await reloadData?.();
      }
      setJobs(prev => prev.map(j => j.id === job.id ? nextJob : j));
      setForm(nextJob);
      setEditing(false);
    } catch (e) {
      alert(e.message || "Could not save this job requisition.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg" style={{ maxWidth: 740 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="modal-title">{editing ? "Edit Job" : viewJob.title}</div>
            <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 2, fontFamily: "var(--mono)" }}>
              {viewJob.dept} · {viewJob.entity} · {viewJob.level}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {canEdit && !editing && (
              <button className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}>
                <Icon name="edit" size={13} /> Edit
              </button>
            )}
            <button className="modal-close" onClick={onClose}>×</button>
          </div>
        </div>
        <div className="modal-body">
          {editing ? (
            <div>
              <div className="form-group"><label className="form-label">Job title</label><input className="form-input" value={form.title} onChange={e => set("title", e.target.value)} /></div>
              <div className="form-row">
                <div className="form-group"><label className="form-label">Department</label><select className="form-select" value={form.dept} onChange={e => set("dept", e.target.value)}>{DEPARTMENTS.map(d => <option key={d}>{d}</option>)}</select></div>
                <div className="form-group"><label className="form-label">Entity</label><select className="form-select" value={form.entity} onChange={e => set("entity", e.target.value)}>{ENTITIES.map(en => <option key={en}>{en}</option>)}</select></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label className="form-label">Position type</label><select className="form-select" value={form.positionType || "Manpower"} onChange={e => set("positionType", e.target.value)}>{POSITION_TYPES.map(t => <option key={t}>{t}</option>)}</select></div>
                <div className="form-group"><label className="form-label">Job family</label><select className="form-select" value={form.level} onChange={e => set("level", e.target.value)}>{JOB_FAMILIES.map(f => <option key={f}>{f}</option>)}</select></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label className="form-label">Headcount</label><input className="form-input" type="number" min="1" value={form.headcount} onChange={e => set("headcount", parseInt(e.target.value) || 1)} /></div>
                <div className="form-group"><label className="form-label">Status</label><select className="form-select" value={form.status} onChange={e => set("status", e.target.value)}><option>Open</option><option>Draft</option><option>Closed</option></select></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label className="form-label">Salary min (EGP)</label><input className="form-input" type="number" value={form.salaryMin} onChange={e => set("salaryMin", parseFloat(e.target.value) || 0)} /></div>
                <div className="form-group"><label className="form-label">Salary max (EGP)</label><input className="form-input" type="number" value={form.salaryMax} onChange={e => set("salaryMax", parseFloat(e.target.value) || 0)} /></div>
              </div>
              <div className="form-group"><label className="form-label">Description</label><textarea className="form-textarea" value={form.description} onChange={e => set("description", e.target.value)} /></div>
            </div>
          ) : (
            <div>
              {/* Job info cards */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 24 }}>
                {[
                  { label: "Headcount", value: viewJob.headcount },
                  { label: "Applications", value: jobApps.length },
                  { label: "Budget", value: canViewSalary ? (viewJob.salaryMin ? `${viewJob.salaryMin.toLocaleString()} – ${viewJob.salaryMax.toLocaleString()} EGP` : "—") : "Restricted" },
                  { label: "Recruiter", value: viewJob.recruiter || "Unassigned" },
                  { label: "Approved by", value: viewJob.approvedBy || "—" },
                  { label: "Approval date", value: viewJob.approvalDate || "—" },
                  { label: "Open date", value: viewJob.openDate },
                ].map(({ label, value }) => (
                  <div key={label} style={{ background: "var(--bg3)", borderRadius: "var(--radius)", padding: "12px 14px", border: "1px solid var(--border)" }}>
                    <div style={{ fontSize: 10, fontFamily: "var(--mono)", color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4 }}>{label}</div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text)" }}>{value}</div>
                  </div>
                ))}
              </div>

              {viewJob.description && (
                <div style={{ background: "var(--bg3)", borderRadius: "var(--radius)", padding: "12px 16px", marginBottom: 20, border: "1px solid var(--border)" }}>
                  <div style={{ fontSize: 11, fontFamily: "var(--mono)", color: "var(--text3)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>Description</div>
                  <div style={{ fontSize: 13, color: "var(--text2)", lineHeight: 1.6 }}>{viewJob.description}</div>
                </div>
              )}

              {/* Applications for this requisition */}
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", marginBottom: 12 }}>
                Applications ({jobApps.length})
              </div>
              {jobApps.length === 0 ? (
                <div style={{ textAlign: "center", padding: "32px", color: "var(--text3)", background: "var(--bg3)", borderRadius: "var(--radius)", border: "1px solid var(--border)" }}>
                  No active applications for this requisition yet
                </div>
              ) : (
                <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "var(--bg3)" }}>
                        <th style={{ padding: "10px 14px", textAlign: "left", fontSize: 11, fontFamily: "var(--mono)", color: "var(--text3)", borderBottom: "1px solid var(--border)" }}>Candidate</th>
                        <th style={{ padding: "10px 14px", textAlign: "left", fontSize: 11, fontFamily: "var(--mono)", color: "var(--text3)", borderBottom: "1px solid var(--border)" }}>Stage</th>
                        <th style={{ padding: "10px 14px", textAlign: "left", fontSize: 11, fontFamily: "var(--mono)", color: "var(--text3)", borderBottom: "1px solid var(--border)" }}>Applied</th>
                        <th style={{ padding: "10px 14px", textAlign: "left", fontSize: 11, fontFamily: "var(--mono)", color: "var(--text3)", borderBottom: "1px solid var(--border)" }}>Days in stage</th>
                      </tr>
                    </thead>
                    <tbody>
                      {jobApps.map(app => {
                        const cand = candidates.find(c => c.id === app.candidateId);
                        if (!cand) return null;
                        return (
                          <tr key={app.id} style={{ borderBottom: "1px solid var(--border)" }}>
                            <td style={{ padding: "10px 14px" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <div style={{ width: 28, height: 28, borderRadius: "50%", background: cand.color + "22", color: cand.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700 }}>{initials(cand.name)}</div>
                                <div>
                                  <div
                                    onClick={() => openModal("viewCandidate", { candidate: cand, activeApp: app, activeJob: viewJob })}
                                    style={{ fontSize: 13, fontWeight: 500, color: "var(--accent)", cursor: "pointer" }}
                                  >
                                    {cand.name}
                                  </div>
                                  <div style={{ fontSize: 11, color: "var(--text3)" }}>{cand.email}</div>
                                </div>
                              </div>
                            </td>
                            <td style={{ padding: "10px 14px" }}><span className={`badge ${stageBadge(app.stage)}`}>{app.stage}</span></td>
                            <td style={{ padding: "10px 14px", fontSize: 12, fontFamily: "var(--mono)", color: "var(--text3)" }}>{app.appliedDate}</td>
                            <td style={{ padding: "10px 14px", fontSize: 12, fontFamily: "var(--mono)", color: app.daysInStage > 7 ? "var(--red)" : "var(--text2)" }}>{app.daysInStage}d</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="modal-footer">
          {editing ? (
            <>
              <button className="btn btn-ghost" onClick={() => setEditing(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveEdit} disabled={saving}>{saving ? "Saving..." : "Save changes"}</button>
            </>
          ) : (
            <button className="btn btn-ghost" onClick={onClose}>Close</button>
          )}
        </div>
      </div>
    </div>
  );
}

function AssignRecruiterModal({ job, users = [], setJobs, backendActions, reloadData, onClose }) {
  const recruiterOptions = users
    .filter(u => u.active !== false && ["Admin", "Recruiter", "admin", "recruiter"].includes(u.role || u.roleKey))
    .sort((a, b) => String(a.fullName || "").localeCompare(String(b.fullName || "")));
  const [recruiterId, setRecruiterId] = useState(job.recruiterId || recruiterOptions[0]?.id || "");
  const [saving, setSaving] = useState(false);
  const selected = recruiterOptions.find(u => String(u.id) === String(recruiterId));

  const save = async () => {
    if (!recruiterId) {
      alert("Please select a recruiter first.");
      return;
    }
    setSaving(true);
    try {
      if (backendActions.assignPositionRecruiter) {
        await backendActions.assignPositionRecruiter(job.id, recruiterId);
      } else {
        await backendActions.updatePosition(job.id, { ...job, recruiterId });
      }
      setJobs(prev => prev.map(j => j.id === job.id ? {
        ...j,
        recruiterId,
        recruiter: selected?.fullName || j.recruiter,
      } : j));
      await reloadData?.();
      onClose();
    } catch (e) {
      alert(e.message || "Could not assign recruiter.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="modal-title">Assign Recruiter</div>
            <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 2 }}>{job.title}</div>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          {recruiterOptions.length === 0 ? (
            <div className="alert alert-amber">
              <Icon name="alert" size={14} />
              <span>No active Admin or Recruiter users were found. Add users in Settings first, then assign them here.</span>
            </div>
          ) : (
            <div className="form-group">
              <label className="form-label">Recruiter</label>
              <select className="form-select" value={recruiterId} onChange={e => setRecruiterId(e.target.value)}>
                {recruiterOptions.map(user => (
                  <option key={user.id} value={user.id}>{user.fullName} — {user.email}</option>
                ))}
              </select>
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving || recruiterOptions.length === 0}>
            {saving ? "Saving..." : "Assign recruiter"}
          </button>
        </div>
      </div>
    </div>
  );
}

function JobsPage({ jobs, setJobs, applications, candidates, roleConfig, canViewSalary, openModal, backendActions, reloadData, allUsers = [] }) {
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("All");
  const [filterEntity, setFilterEntity] = useState("All");
  const [filterDept, setFilterDept] = useState("All");
  const [filterPositionType, setFilterPositionType] = useState("All");
  const [filterRecruiter, setFilterRecruiter] = useState("All");
  const [showImporter, setShowImporter] = useState(false);
  const [selectedJob, setSelectedJob] = useState(null);
  const [assignRecruiterJob, setAssignRecruiterJob] = useState(null);
  const normalizeFilterValue = value => String(value || "").trim().toLowerCase();
  const canonicalStatus = value => {
    const normalized = normalizeFilterValue(value);
    if (!normalized) return "";
    if (normalized === "open") return "open";
    if (normalized === "draft") return "draft";
    if (normalized === "closed" || normalized === "close") return "closed";
    if (normalized === "on hold" || normalized === "on_hold") return "on_hold";
    if (normalized === "pending approval" || normalized === "pending_approval") return "pending_approval";
    return normalized;
  };
  const canonicalEntity = value => {
    const normalized = normalizeFilterValue(value);
    if (!normalized) return "";
    if (normalized === "egypt" || normalized === "karm egypt") return "egypt";
    if (normalized === "cyprus" || normalized === "karm cyprus") return "cyprus";
    if (normalized === "tunisia" || normalized === "karm tunisia") return "tunisia";
    if (normalized === "holdco. (uk)" || normalized === "uk") return "uk";
    if (normalized === "sub holdco. (nl)" || normalized === "nl" || normalized === "netherlands") return "nl";
    return normalized;
  };
  const statusDisplayLabel = value => {
    const canonical = canonicalStatus(value);
    if (canonical === "open") return "Open";
    if (canonical === "draft") return "Draft";
    if (canonical === "closed") return "Closed";
    if (canonical === "on_hold") return "On Hold";
    if (canonical === "pending_approval") return "Pending Approval";
    return value || "";
  };
  const entityDisplayLabel = value => {
    const canonical = canonicalEntity(value);
    if (canonical === "egypt") return "Karm Egypt";
    if (canonical === "cyprus") return "Karm Cyprus";
    if (canonical === "tunisia") return "Karm Tunisia";
    if (canonical === "uk") return "HoldCo. (UK)";
    if (canonical === "nl") return "Sub HoldCo. (NL)";
    return value || "";
  };
  const approvalDateDisplay = job => {
    if (job.approvalDate) {
      return { text: formatDisplayDate(job.approvalDate), title: "Approval date captured in ATS." };
    }
    const status = canonicalStatus(job.status);
    if (status === "draft" || status === "pending_approval") {
      return { text: "Pending", title: "This requisition is not approved yet." };
    }
    if (job.openDate) {
      return { text: formatDisplayDate(job.openDate), title: "Approval date was not captured; showing requisition open date." };
    }
    return { text: "Not recorded", title: "Approval date was not captured for this requisition." };
  };
  const requisitionStatusOptions = ["Open", "Draft", "Closed"];
  const liveStatusOptions = Array.from(new Set(jobs.map(j => statusDisplayLabel(j.status)).filter(Boolean)));
  const statusOptions = Array.from(new Set([
    ...requisitionStatusOptions,
    ...liveStatusOptions,
  ]));
  const entityOptions = Array.from(new Set(jobs.map(j => entityDisplayLabel(j.entity)).filter(Boolean))).sort();
  const deptOptions = Array.from(new Set([...DEPARTMENTS, ...jobs.map(j => j.dept).filter(Boolean)])).sort();
  const positionTypeOptions = Array.from(new Set(jobs.map(j => j.positionType).filter(Boolean))).sort();
  const recruiterOptions = Array.from(new Set(jobs.map(j => j.recruiter).filter(Boolean))).sort();

  const filtered = jobs.filter(j => {
    const matchesStatus = filterStatus === "All" || canonicalStatus(j.status) === canonicalStatus(filterStatus);
    const matchesEntity = filterEntity === "All" || canonicalEntity(j.entity) === canonicalEntity(filterEntity);
    const matchesDept = filterDept === "All" ||
      normalizeFilterValue(j.dept) === normalizeFilterValue(filterDept) ||
      (normalizeFilterValue(filterDept) === "innovation center" && normalizeFilterValue(j.title) === "innovation center");
    const matchesPositionType = filterPositionType === "All" || normalizeFilterValue(j.positionType || "Manpower") === normalizeFilterValue(filterPositionType);
    const matchesRecruiter = filterRecruiter === "All" || normalizeFilterValue(j.recruiter || "Unassigned") === normalizeFilterValue(filterRecruiter);
    const matchesSearch = j.title.toLowerCase().includes(search.toLowerCase());
    return matchesStatus && matchesEntity && matchesDept && matchesPositionType && matchesRecruiter && matchesSearch;
  });

  const canCreate = !!roleConfig.canCreateRequisitions;
  const canDelete = !!roleConfig.canDeleteRecords;

  const toggleJobStatus = async (id, currentStatus) => {
    const next = currentStatus === "Open" ? "Closed" : "Open";
    setJobs(prev => prev.map(j => j.id === id ? { ...j, status: next } : j));
    try {
      await backendActions.updatePositionStatus(id, next === "Open" ? "open" : "closed");
      await reloadData?.();
    } catch (e) {
      await reloadData?.();
      alert(e.message || "Could not update the requisition status in the backend.");
    }
  };

  const deleteJob = async (job) => {
    const appCount = applications.filter(a => a.jobId === job.id && a.status === "Active").length;
    const warning = appCount > 0
      ? `\n\nThis position currently has ${appCount} active application(s), so the backend will block deletion. Close the position instead, or move/reject the active applications first.`
      : "";
    const okToDelete = window.confirm(`Delete "${job.title}"?\n\nThis removes the position from the live ATS for all users.${warning}`);
    if (!okToDelete) return;
    try {
      await backendActions.deletePosition(job.id);
      setJobs(prev => prev.filter(item => item.id !== job.id));
      await reloadData?.();
    } catch (e) {
      alert(e.message || "Could not delete this position.");
    }
  };

  const exportJobs = () => {
    const headers = ["Job Title", "Department", "Entity", "Position Type", "Job Family", "Headcount", "Active Applications", "Open Date", "Recruiter", "Hiring Manager", "Salary Min (EGP)", "Salary Max (EGP)", "Status"];
    const rows = filtered.map(j => {
      const appCount = applications.filter(a => a.jobId === j.id && a.status === "Active").length;
      return [j.title, j.dept, j.entity, j.positionType || "Manpower", j.level, j.headcount, appCount, j.openDate, j.recruiter, j.hiringManager, canViewSalary ? j.salaryMin : "Restricted", canViewSalary ? j.salaryMax : "Restricted", j.status];
    });
    const dateStr = new Date().toISOString().split("T")[0];
    exportToCSV(`Karm_ATS_Job_Requisitions_${dateStr}.csv`, headers, rows);
  };

  return (
    <>
      {showImporter && (
        <ManpowerPlanImporter
          closeModal={() => setShowImporter(false)}
          jobs={jobs}
          setJobs={setJobs}
          backendActions={backendActions}
          reloadData={reloadData}
        />
      )}
      {selectedJob && (
        <JobDetailModal
          job={selectedJob}
          applications={applications}
          candidates={candidates}
          jobs={jobs}
          setJobs={setJobs}
          openModal={openModal}
          onClose={() => setSelectedJob(null)}
          canEdit={canCreate}
          canViewSalary={canViewSalary}
          backendActions={backendActions}
          reloadData={reloadData}
        />
      )}
      {assignRecruiterJob && (
        <AssignRecruiterModal
          job={assignRecruiterJob}
          users={allUsers}
          setJobs={setJobs}
          backendActions={backendActions}
          reloadData={reloadData}
          onClose={() => setAssignRecruiterJob(null)}
        />
      )}
      <div className="page-header">
        <div>
          <div className="page-title">Job Requisitions</div>
          <div className="page-sub">{jobs.length} total requisitions across all entities</div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <ExportButton onClick={exportJobs} />
          {canCreate && <button className="btn btn-ghost" onClick={() => setShowImporter(true)}><span style={{ fontSize: 15 }}>📋</span> Import Manpower Plan</button>}
          {canCreate && <button className="btn btn-primary" onClick={() => openModal("addJob")}><Icon name="plus" size={14} /> New Requisition</button>}
        </div>
      </div>
      <div className="page-content">
        <div className="toolbar" style={{ marginBottom: 16 }}>
          <div className="search-wrap">
            <span className="search-icon"><Icon name="search" size={14} /></span>
            <input className="search-input" placeholder="Search roles..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div>
            <label className="form-label">Status</label>
            <select className="form-select" style={{ width: "auto" }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option>All</option>{statusOptions.map(status => <option key={status}>{status}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">Entity</label>
            <select className="form-select" style={{ width: "auto" }} value={filterEntity} onChange={e => setFilterEntity(e.target.value)}>
              <option>All</option>{entityOptions.map(entity => <option key={entity}>{entity}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">Department</label>
            <select className="form-select" style={{ width: "auto" }} value={filterDept} onChange={e => setFilterDept(e.target.value)}>
              <option>All</option>{deptOptions.map(d => <option key={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">Position type</label>
            <select className="form-select" style={{ width: "auto" }} value={filterPositionType} onChange={e => setFilterPositionType(e.target.value)}>
              <option>All</option>{positionTypeOptions.map(type => <option key={type}>{type}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">Recruiter</label>
            <select className="form-select" style={{ width: "auto" }} value={filterRecruiter} onChange={e => setFilterRecruiter(e.target.value)}>
              <option>All</option>{recruiterOptions.map(name => <option key={name}>{name}</option>)}
            </select>
          </div>
          <div className="toolbar-summary">
            <div className="toolbar-count" aria-live="polite">
              <div className="toolbar-count-value">{filtered.length}</div>
              <div className="toolbar-count-label">{filterStatus === "All" ? "Positions shown" : `${statusDisplayLabel(filterStatus)} positions`}</div>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead><tr><th>Job title</th><th>Department</th><th>Entity</th><th>Position type</th><th>Budget</th><th>Approved by</th><th>Approval date</th><th>HC</th><th>Applications</th><th>Recruiter</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {filtered.map(job => {
                  const appCount = applications.filter(a => a.jobId === job.id && a.status === "Active").length;
                  const statusActionDisabled = job.status === "Draft";
                  const statusActionLabel = job.status === "Closed" ? "Reopen" : "Close";
                  const statusActionReason = statusActionDisabled ? "Open the draft before closing it." : "";
                  const approvalDate = approvalDateDisplay(job);
                  return (
                    <tr key={job.id} style={{ cursor: "pointer" }} onClick={() => setSelectedJob(job)}>
                      <td className="strong" style={{ color: "var(--accent)" }}>{job.title}</td>
                      <td>{job.dept}</td>
                      <td><span className="tag">{entityDisplayLabel(job.entity)}</span></td>
                      <td><span className={`badge ${positionTypeBadge(job.positionType)}`}>{job.positionType || "Manpower"}</span></td>
                      <td style={{ fontFamily: "var(--mono)", color: "var(--text2)" }}>{canViewSalary ? `${(job.salaryMin || 0).toLocaleString()}–${(job.salaryMax || 0).toLocaleString()}` : "Restricted"}</td>
                      <td>{job.approvedBy || "—"}</td>
                      <td style={{ fontFamily: "var(--mono)", color: "var(--text3)" }} title={approvalDate.title}>{approvalDate.text}</td>
                      <td style={{ fontFamily: "var(--mono)" }}>{job.headcount}</td>
                      <td style={{ fontFamily: "var(--mono)", color: "var(--accent)", fontWeight: 600 }}>{appCount}</td>
                      <td>{job.recruiter || "Unassigned"}</td>
                      <td><span className={`badge ${jobStatusBadge(statusDisplayLabel(job.status))}`}>{statusDisplayLabel(job.status)}</span></td>
                      <td onClick={e => e.stopPropagation()}>
                        {(canCreate || canDelete) && (
                          <div className="row-actions">
                            {canCreate && (
                              <button className="btn btn-ghost btn-sm" onClick={() => setAssignRecruiterJob(job)}>
                                Assign recruiter
                              </button>
                            )}
                            {canCreate && (
                              <>
                                <button
                                  className="btn btn-ghost btn-sm"
                                  disabled={statusActionDisabled}
                                  title={statusActionReason || `${statusActionLabel} this requisition`}
                                  style={job.status === "Closed" ? { color: "var(--teal)", borderColor: "var(--teal-soft)" } : {}}
                                  onClick={() => !statusActionDisabled && toggleJobStatus(job.id, job.status)}
                                >
                                  {statusActionLabel}
                                </button>
                                {statusActionDisabled && <div className="row-action-hint">{statusActionReason}</div>}
                              </>
                            )}
                            {canDelete && (
                              <button className="btn btn-danger btn-sm" onClick={() => deleteJob(job)}>
                                Delete
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}

// ── CANDIDATES PAGE ───────────────────────────────────────────────────────────
function CandidatesPage({ candidates, setCandidates, applications, setApplications, jobs, roleConfig, openModal, backendActions, reloadData }) {
  const [search, setSearch] = useState("");
  const [filterSource, setFilterSource] = useState("All");
  const [filterJob, setFilterJob] = useState("All");
  const [filterDept, setFilterDept] = useState("All");
  const [filterStage, setFilterStage] = useState("All");
  const [deletingCandidateId, setDeletingCandidateId] = useState(null);
  const [assigningCandidateId, setAssigningCandidateId] = useState(null);
  const [savingSourceId, setSavingSourceId] = useState(null);
  const deptOptions = Array.from(new Set(jobs.map(j => j.dept).filter(Boolean))).sort();
  const statusDisplayLabel = value => {
    const normalized = String(value || "").trim().toLowerCase();
    if (normalized === "open") return "Open";
    if (normalized === "draft") return "Draft";
    if (normalized === "closed" || normalized === "archived") return "Closed";
    return value || "Open";
  };
  const allPositionOptions = [...jobs].sort((a, b) => {
    const statusOrder = { Open: 0, Draft: 1, Closed: 2 };
    const orderA = statusOrder[statusDisplayLabel(a.status)] ?? 3;
    const orderB = statusOrder[statusDisplayLabel(b.status)] ?? 3;
    if (orderA !== orderB) return orderA - orderB;
    return `${a.title} ${a.dept || ""}`.localeCompare(`${b.title} ${b.dept || ""}`);
  });
  const positionOptionLabel = (job) => `${job.title}${job.dept ? ` · ${job.dept}` : ""} (${statusDisplayLabel(job.status)})`;
  const canCreate = !!roleConfig.canEditCandidates;
  const canDelete = !!roleConfig.canDeleteRecords;
  const canEditSource = !!roleConfig.canEditCandidates;
  const normalizeCandidateSource = (source) => {
    const normalized = String(source || "").trim().toLowerCase();
    if (normalized === "linkedin") return "LinkedIn";
    if (normalized === "forasna" || normalized === "job_board") return "Forasna";
    if (normalized === "career" || normalized === "career email" || normalized === "career_email" || normalized === "other") return "Career Email";
    if (normalized === "referral") return "Referral";
    if (normalized === "internal" || normalized === "internal_transfer") return "Internal Transfer";
    return "";
  };

  const filtered = candidates.filter(c => {
    const sourceLabel = normalizeCandidateSource(c.source);
    const matchSource = filterSource === "All" || sourceLabel === filterSource;
    const matchSearch = c.name.toLowerCase().includes(search.toLowerCase()) || String(c.email || "").toLowerCase().includes(search.toLowerCase());
    const activeApp = applications.find(a => a.candidateId === c.id && a.status === "Active");
    const activeJob = activeApp ? jobs.find(j => j.id === activeApp.jobId) : null;
    const matchJob = filterJob === "All" || applications.some(a => a.candidateId === c.id && String(a.jobId) === String(filterJob) && a.status === "Active");
    const matchDept = filterDept === "All" || activeJob?.dept === filterDept;
    const matchStage = filterStage === "All" || activeApp?.stage === filterStage;
    return matchSource && matchSearch && matchJob && matchDept && matchStage;
  });

  const deleteCandidate = async (candidate) => {
    if (!canDelete || !backendActions?.deleteCandidate) return;
    const activeCount = applications.filter(a => a.candidateId === candidate.id && a.status === "Active").length;
    const warning = activeCount
      ? ` They currently have ${activeCount} active application${activeCount === 1 ? "" : "s"}.`
      : "";
    if (!window.confirm(`Delete candidate ${candidate.name}? This will hide the candidate from the ATS.${warning}`)) return;

    setDeletingCandidateId(candidate.id);
    try {
      await backendActions.deleteCandidate(candidate.id);
      await reloadData?.();
    } catch (e) {
      alert(e.message || "Could not delete candidate.");
    } finally {
      setDeletingCandidateId(null);
    }
  };

  const assignCandidatePosition = async (candidate, jobId) => {
    if (!jobId || !canCreate) return;
    const job = jobs.find(j => String(j.id) === String(jobId));
    if (!job) return;
    setAssigningCandidateId(candidate.id);
    try {
      if (backendActions?.createApplication) {
        await backendActions.createApplication({ candidateId: candidate.id, positionId: job.id });
        await reloadData?.();
      } else if (setApplications) {
        setApplications(prev => [...prev, {
          id: Date.now(),
          candidateId: candidate.id,
          jobId: job.id,
          stage: "Applied",
          status: "Active",
          recruiter: job.recruiter || "Recruiter",
          appliedDate: todayISO(),
          notes: "",
          daysInStage: 0,
          priority: "",
          nextAction: "Review CV",
          lastActivityAt: todayISO(),
        }]);
      }
    } catch (e) {
      alert(e.message || "Could not assign this candidate to the selected position.");
    } finally {
      setAssigningCandidateId(null);
    }
  };

  const updateCandidateSource = async (candidate, source) => {
    if (!source || !canEditSource) return;
    const previousSource = candidate.source;
    setSavingSourceId(candidate.id);
    setCandidates(prev => prev.map(item => item.id === candidate.id ? { ...item, source } : item));
    try {
      if (backendActions?.updateCandidate) {
        await backendActions.updateCandidate(candidate.id, { source });
        await reloadData?.();
      }
    } catch (e) {
      setCandidates(prev => prev.map(item => item.id === candidate.id ? { ...item, source: previousSource } : item));
      alert(e.message || "Could not update candidate source.");
    } finally {
      setSavingSourceId(null);
    }
  };

  const exportCandidates = () => {
    const headers = ["Full Name", "Email", "Phone", "Nationality", "Source", "Referred By", "Active Applications", "Current Stage", "Applied Job", "Date Added", "Tags"];
    const rows = filtered.map(c => {
      const activeApp = applications.find(a => a.candidateId === c.id && a.status === "Active");
      const activeJob = activeApp ? jobs.find(j => j.id === activeApp.jobId) : null;
      const appCount = applications.filter(a => a.candidateId === c.id && a.status === "Active").length;
      return [
        c.name, c.email, c.phone || "", c.nationality, normalizeCandidateSource(c.source) || c.source, normalizeCandidateSource(c.source) === "Referral" ? (c.referredBy || "") : "",
        appCount,
        activeApp?.stage || "—",
        activeJob?.title || "—",
        c.addedDate,
        (c.tags || []).join(", "),
      ];
    });
    const dateStr = new Date().toISOString().split("T")[0];
    exportToCSV(`Karm_ATS_Talent_Database_${dateStr}.csv`, headers, rows);
  };

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Talent Database</div>
          <div className="page-sub">{candidates.length} talent profile{candidates.length === 1 ? "" : "s"} in the system</div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <ExportButton onClick={exportCandidates} />
          {canCreate && <button data-testid="open-add-candidate" className="btn btn-primary" onClick={() => openModal("addCandidate")}><Icon name="plus" size={14} /> Add Candidate</button>}
        </div>
      </div>
      <div className="page-content">
        <div className="toolbar" style={{ marginBottom: 16 }}>
          <div className="search-wrap">
            <span className="search-icon"><Icon name="search" size={14} /></span>
            <input className="search-input" placeholder="Search talent..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div>
            <label className="form-label">Position</label>
            <select className="form-select" style={{ width: "auto" }} value={filterJob} onChange={e => setFilterJob(e.target.value)}>
              <option value="All">All positions</option>
              {allPositionOptions.map(j => <option key={j.id} value={j.id}>{positionOptionLabel(j)}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">Department</label>
            <select className="form-select" style={{ width: "auto" }} value={filterDept} onChange={e => setFilterDept(e.target.value)}>
              <option>All</option>{deptOptions.map(d => <option key={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">Source</label>
            <select className="form-select" style={{ width: "auto" }} value={filterSource} onChange={e => setFilterSource(e.target.value)}>
              <option>All</option>{SOURCES.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">Stage</label>
            <select className="form-select" style={{ width: "auto" }} value={filterStage} onChange={e => setFilterStage(e.target.value)}>
              <option>All</option>{STAGES.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div className="toolbar-summary">
            <div className="toolbar-count" aria-live="polite">
              <div className="toolbar-count-value">{filtered.length}</div>
              <div className="toolbar-count-label">
                {filterSource !== "All"
                  ? `${filterSource} profiles`
                  : filterStage !== "All"
                    ? `${filterStage} profiles`
                    : "Profiles shown"}
              </div>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead><tr><th>Candidate</th><th>Email</th><th>Nationality</th><th>Source</th><th>Active apps</th><th>Current stage</th><th>Added</th><th></th></tr></thead>
              <tbody>
                {filtered.map(c => {
                  const activeApp = applications.find(a => a.candidateId === c.id && a.status === "Active");
                  const activeJob = activeApp ? jobs.find(j => j.id === activeApp.jobId) : null;
                  return (
                    <tr key={c.id}>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div className="candidate-avatar" style={{ background: c.color + "22", color: c.color, fontSize: 11, fontWeight: 600 }}>{initials(c.name)}</div>
                          <div>
                            <span
                              className="strong"
                              onClick={() => openModal("viewCandidate", { candidate: c, activeApp, activeJob })}
                              style={{ color: "var(--accent)", cursor: "pointer" }}
                            >
                              {c.name}
                            </span>
                            {activeJob ? (
                              <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 3 }}>
                                {activeJob.title}
                              </div>
                            ) : canCreate ? (
                              <select
                                className="form-select"
                                value=""
                                onChange={e => assignCandidatePosition(c, e.target.value)}
                                disabled={assigningCandidateId === c.id}
                                style={{ marginTop: 6, width: "min(220px, 100%)", height: 34, fontSize: 12 }}
                                aria-label={`Select position for ${c.name}`}
                              >
                                <option value="">{assigningCandidateId === c.id ? "Assigning..." : "Select position..."}</option>
                                {allPositionOptions.map(job => (
                                  <option key={job.id} value={job.id}>{positionOptionLabel(job)}</option>
                                ))}
                              </select>
                            ) : (
                              <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 3 }}>
                                No active position
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td style={{ color: "var(--text3)", fontFamily: "var(--mono)", fontSize: 12 }}>{candidateEmailDisplay(c.email)}</td>
                      <td>{c.nationality}</td>
                      <td>
                        <select
                          className="form-select"
                          value={normalizeCandidateSource(c.source)}
                          onChange={e => updateCandidateSource(c, e.target.value)}
                          disabled={!canEditSource || savingSourceId === c.id}
                          style={{ width: 180, height: 34, fontSize: 12 }}
                          aria-label={`Source for ${c.name}`}
                        >
                          <option value="">Select source</option>
                          {SOURCES.map(source => <option key={source} value={source}>{source}</option>)}
                        </select>
                        {savingSourceId === c.id && (
                          <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 4 }}>Saving...</div>
                        )}
                        {normalizeCandidateSource(c.source) === "Referral" && c.referredBy && (
                          <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 4 }}>from {c.referredBy}</div>
                        )}
                      </td>
                      <td style={{ fontFamily: "var(--mono)", color: "var(--accent)" }}>{applications.filter(a => a.candidateId === c.id && a.status === "Active").length}</td>
                      <td>{activeApp ? <span className={`badge ${stageBadge(activeApp.stage)}`}>{activeApp.stage}</span> : <span style={{ color: "var(--text3)", fontSize: 12 }}>—</span>}</td>
                      <td style={{ fontFamily: "var(--mono)", color: "var(--text3)", fontSize: 12 }}>{c.addedDate}</td>
                      <td>
                        <div style={{ display: "flex", gap: 6, alignItems: "center", justifyContent: "flex-end", flexWrap: "wrap" }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => openModal("viewCandidate", { candidate: c, activeApp, activeJob })}>View</button>
                          {canDelete && (
                            <button
                              className="btn btn-danger btn-sm"
                              data-testid={`delete-candidate-${c.id}`}
                              onClick={() => deleteCandidate(c)}
                              disabled={deletingCandidateId === c.id}
                            >
                              {deletingCandidateId === c.id ? "Deleting..." : "Delete"}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}

// ── CV PARSER MODAL ───────────────────────────────────────────────────────────
function CVParserModal({ jobs, setJobs, candidates, setCandidates, applications, setApplications, closeModal, ctx, initialFiles = null }) {
  const [phase, setPhase] = useState("drop"); // drop | parsing | review | done
  const [dragOver, setDragOver] = useState(false);
  const [parsedFiles, setParsedFiles] = useState([]); // [{fileName, extracted, editing}]
  const [currentIdx, setCurrentIdx] = useState(0);
  const [error, setError] = useState("");
  const [initialFilesHandled, setInitialFilesHandled] = useState(false);
  const fileInputRef = useState(null);

  const COLORS = ["#4f8ef7","#2dd4b4","#a78bfa","#f59e0b","#fb923c","#f87171","#4ade80","#38bdf8","#e879f9","#34d399"];
  const PDF_UNREADABLE_MESSAGE = "We could not read this PDF automatically. Please enter the candidate details manually.";
  const isPdfFile = (file) => {
    const lower = file.name.toLowerCase();
    return file.type === "application/pdf" || lower.endsWith(".pdf");
  };

  const readFileAsBase64 = (file) => new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload = () => res(reader.result.split(",")[1]);
    reader.onerror = rej;
    reader.readAsDataURL(file);
  });

  const readFileAsText = (file) => new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload = () => res(reader.result);
    reader.onerror = rej;
    reader.readAsText(file);
  });

  const readFileAsDataUrl = (file) => new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload = () => res(reader.result);
    reader.onerror = rej;
    reader.readAsDataURL(file);
  });

  const jobOptionLabel = (job) => `${job.title} · ${job.dept} · ${job.entity}`;

  const uniqueOpenJobs = useMemo(() => {
    const seen = new Map();
    jobs.filter(j => j.status === "Open").forEach(job => {
      const key = jobOptionLabel(job).toLowerCase();
      if (!seen.has(key)) seen.set(key, job);
    });
    return Array.from(seen.values());
  }, [jobs]);

  const extractPdfText = async (file) => {
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const pages = [];
    for (let pageNo = 1; pageNo <= pdf.numPages; pageNo += 1) {
      const page = await pdf.getPage(pageNo);
      const content = await page.getTextContent();
      const rows = new Map();
      content.items.forEach(item => {
        const text = item.str || "";
        if (!text.trim()) return;
        const y = Math.round(item.transform?.[5] || 0);
        const x = item.transform?.[4] || 0;
        if (!rows.has(y)) rows.set(y, []);
        rows.get(y).push({ x, text });
      });
      const pageLines = Array.from(rows.entries())
        .sort((a, b) => b[0] - a[0])
        .map(([, parts]) => parts.sort((a, b) => a.x - b.x).map(part => part.text).join(" "))
        .map(cleanLine)
        .filter(Boolean);
      pages.push(pageLines.join("\n"));
    }
    return pages.join("\n");
  };

  const extractDocxText = async (file) => {
    const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return result.value || "";
  };

  const readCvText = async (file) => {
    const lower = file.name.toLowerCase();
    if (isPdfFile(file)) return extractPdfText(file);
    if (lower.endsWith(".docx")) return extractDocxText(file);
    if (file.type.startsWith("text/") || lower.endsWith(".txt") || lower.endsWith(".csv")) return readFileAsText(file);
    return "";
  };

  const collapseSpacedLetters = (value) => {
    const words = value.split(/\s+/).filter(Boolean);
    if (words.length < 4) return value;
    const rebuilt = [];
    for (let i = 0; i < words.length; i += 1) {
      if (/^[A-Za-z]$/.test(words[i])) {
        let j = i;
        const letters = [];
        while (j < words.length && /^[A-Za-z]$/.test(words[j])) {
          letters.push(words[j]);
          j += 1;
        }
        if (letters.length >= 2) {
          rebuilt.push(letters.join(""));
          i = j - 1;
        } else {
          rebuilt.push(...letters);
          i = j - 1;
        }
      } else {
        rebuilt.push(words[i]);
      }
    }
    return rebuilt.join(" ");
  };

  const normalizeExtractedText = (value) => {
    const lines = value.split(/\r?\n/).map(line => collapseSpacedLetters(cleanLine(line)));
    return lines.join("\n");
  };

  const cleanLine = (line) => line.replace(/[•●▪◦|]+/g, " ").replace(/\s+/g, " ").trim();

const isLikelyPersonName = (line) => {
  if (!line) return false;

  const cleaned = cleanLine(line)
    .replace(/\s+/g, " ")
    .trim();

  const words = cleaned.split(" ").filter(Boolean);

  // realistic name length
  if (words.length < 2 || words.length > 6) return false;

  // reject obvious non-name lines
 if (
  /\b(cv|resume|curriculum|vitae|profile|summary|experience|education|skills|certification|email|phone|mobile|address|linkedin|portfolio|manager|engineer|specialist|analyst|director|developer|consultant)\b/i.test(cleaned)
) {
  return false;
}

  // allow capitals + arabic + accents
  if (!/^[A-Za-zÀ-ÖØ-öø-ÿ\u0600-\u06FF' .-]+$/.test(cleaned)) {
    return false;
  }

  // every word should look name-like
  return words.every(word => word.length >= 2);
};

const extractCandidateName = (text) => {
  if (!text) return "";

  // normalize spacing
  const normalized = text
    .replace(/\r/g, "\n")
    .replace(/[|•●▪◦]/g, " ")
    .replace(/\s+/g, " ");

  // 1. explicit labels
  const labeledMatch = normalized.match(
    /(?:candidate\s*)?name\s*[:\-]\s*([A-Za-zÀ-ÖØ-öø-ÿ\u0600-\u06FF' .-]{5,80})/i
  );

  if (labeledMatch) {
    const candidate = cleanLine(labeledMatch[1]);
    if (isLikelyPersonName(candidate)) {
      return candidate;
    }
  }

  // 2. scan top lines (most CVs have name first)
  const lines = text
    .split(/\r?\n/)
    .map(line => cleanLine(collapseSpacedLetters(line)))
    .filter(Boolean)
    .slice(0, 15);

  for (const line of lines) {
    if (isLikelyPersonName(line)) {
      return line;
    }
  }

  // 3. fallback: detect ALL CAPS names
  for (const line of lines) {
    const cleaned = cleanLine(line);

    if (
      /^[A-Z\s]{6,60}$/.test(cleaned) &&
      cleaned.split(" ").length >= 2
    ) {
      return cleaned
        .toLowerCase()
        .replace(/\b\w/g, c => c.toUpperCase());
    }
  }

  return "";
};

  const extractCurrentTitle = (text) => {
    const labeled = text.match(/(?:current\s*(?:title|position|role)|job\s*title|position)\s*[:\-]\s*([^\n\r]{3,80})/i)?.[1];
    if (labeled) return cleanLine(labeled);
    const titleLine = text.split(/\r?\n/).map(cleanLine).find(line =>
      /\b(manager|engineer|specialist|analyst|director|officer|accountant|technician|developer|consultant|coordinator|supervisor|lead)\b/i.test(line) &&
      line.length < 90
    );
    return titleLine || "";
  };

  const extractYearsExp = (text) => {
    return text.match(/(\d{1,2})\+?\s*(?:years|yrs)\s*(?:of\s*)?(?:experience|exp)/i)?.[1] || "";
  };

  const extractNationality = (text) => {
    const explicit = text.match(/nationality\s*[:\-]\s*([A-Za-z ]{3,40})/i)?.[1];
    if (explicit) return cleanLine(explicit);
    if (/\begyptian\b/i.test(text) || /\begypt\b/i.test(text)) return "Egyptian";
    if (/\bcypriot\b|\bcyprus\b/i.test(text)) return "Cypriot";
    if (/\btunisian\b|\btunisia\b/i.test(text)) return "Tunisian";
    return "";
  };

  const extractSkills = (text) => {
    const skillBank = [
      "solar", "pv", "energy", "engineering", "project management", "business development",
      "sales", "commercial", "finance", "accounting", "procurement", "operations", "maintenance",
      "o&m", "hse", "logistics", "legal", "compliance", "excel", "power bi", "autocad", "crm"
    ];
    const lower = text.toLowerCase();
    return skillBank.filter(skill => lower.includes(skill)).slice(0, 8);
  };

  const suggestJobForText = (text) => {
    const haystack = text.toLowerCase();
    let best = null;
    let bestScore = 0;
    uniqueOpenJobs.forEach(job => {
      const words = `${job.title} ${job.dept}`.toLowerCase().split(/[^a-z0-9&]+/).filter(word => word.length > 2);
      const score = words.reduce((sum, word) => sum + (haystack.includes(word) ? 1 : 0), 0);
      if (score > bestScore) {
        best = job;
        bestScore = score;
      }
    });
    return bestScore > 0 ? best : null;
  };

  const parseCVLocally = async (file) => {
    let text = "";
    let readError = null;
    const isPdf = isPdfFile(file);
    try { text = await readCvText(file); } catch (e) { readError = e; }
    const normalizedText = normalizeExtractedText(text);
    const searchableText = normalizedText.replace(/\s*([@._%+-])\s*/g, "$1");
    const compactText = normalizedText.replace(/\s+/g, " ").trim();
    const email = searchableText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || "";
    const phone = normalizedText.match(/(\+?\d[\d\s().-]{8,}\d)/)?.[0] || "";
    const name = extractCandidateName(normalizedText);
    const skills = extractSkills(`${normalizedText} ${file.name}`);
    const suggestedJobObj = suggestJobForText(`${normalizedText} ${file.name}`);
    const parseWarning = !compactText && isPdf ? PDF_UNREADABLE_MESSAGE : "";
    return {
      name,
      email,
      phone,
      nationality: extractNationality(text),
      currentTitle: extractCurrentTitle(text),
      yearsExp: extractYearsExp(text),
      skills,
      source: "CV Upload",
      suggestedJob: suggestedJobObj ? jobOptionLabel(suggestedJobObj) : "",
      suggestedJobObj,
      summary: compactText
        ? `Extracted ${name ? "candidate name" : "readable CV text"}${email ? ", email" : ""}${phone ? ", phone" : ""}${skills.length ? `, and ${skills.length} skill tag${skills.length === 1 ? "" : "s"}` : ""} from the uploaded CV. Please review before confirming.`
        : parseWarning || "CV was attached, but readable text could not be extracted. Please complete the fields manually.",
      parseWarning,
      parseError: readError?.message || "",
      needsNameReview: !name,
    };
  };

  const handleFiles = async (files) => {
    if (!files.length) return;
    setPhase("parsing");
    setError("");
    const results = [];
    for (const file of Array.from(files)) {
      let fileUrl = "";
      try { fileUrl = await readFileAsDataUrl(file); } catch {}
      {
        const extracted = await parseCVLocally(file);
        const suggestedJobObj = extracted.suggestedJobObj || null;
        results.push({
          fileName: file.name,
          extracted: {
            name: extracted.name || "",
            email: extracted.email || "",
            phone: extracted.phone || "",
            nationality: extracted.nationality || "",
            currentTitle: extracted.currentTitle || "",
            yearsExp: extracted.yearsExp || "",
            skills: extracted.skills || [],
            source: "CV Upload",
            summary: extracted.summary || "",
            parseWarning: extracted.parseWarning || "",
            suggestedJob: extracted.suggestedJob || "",
          },
          parseError: extracted.needsNameReview,
          cvUrl: fileUrl,
          cvFileName: file.name,
          suggestedJobObj,
          selectedJobId: suggestedJobObj?.id || "",
          selectedJobInput: suggestedJobObj ? jobOptionLabel(suggestedJobObj) : "",
        });
      }
    }
    setParsedFiles(results);
    setCurrentIdx(0);
    setPhase("review");
  };

  useEffect(() => {
    if (initialFilesHandled || !initialFiles?.length) return;
    setInitialFilesHandled(true);
    handleFiles(initialFiles);
  }, [initialFiles, initialFilesHandled]);

  const updateField = (field, value) => {
    setParsedFiles(prev => prev.map((p, i) => i === currentIdx ? { ...p, extracted: { ...p.extracted, [field]: value } } : p));
  };

  const confirmCandidate = async () => {
    const item = parsedFiles[currentIdx];
    const { extracted } = item;
    if (!extracted.name?.trim()) {
      alert("Candidate name was not found in the CV. Please enter the candidate name before confirming.");
      return;
    }
    let selectedJobId = item.selectedJobId;
    const typedJob = (item.selectedJobInput || "").trim();
    const matchedJob = uniqueOpenJobs.find(job => jobOptionLabel(job).toLowerCase() === typedJob.toLowerCase());
    if (!selectedJobId && matchedJob) selectedJobId = matchedJob.id;
    try {
      const names = splitName(extracted.name);
      const created = await ctx.backendActions.createCandidate({
        firstName: names.firstName,
        lastName: names.lastName,
        email: extracted.email || `${Date.now()}-${currentIdx}@unknown.local`,
        phone: extracted.phone,
        nationality: extracted.nationality,
        currentTitle: extracted.currentTitle,
        totalYearsExp: parseInt(extracted.yearsExp) || undefined,
        source: "direct",
        tags: extracted.skills?.slice(0, 4) || [],
      });
      if (item.cvUrl?.startsWith("data:") || item.cvUrl?.startsWith("blob:")) {
        const blob = await fetch(item.cvUrl).then(r => r.blob());
        const b64 = item.cvUrl.startsWith("data:")
          ? item.cvUrl.split(",")[1]
          : await new Promise(resolve => {
              const reader = new FileReader();
              reader.onload = () => resolve(String(reader.result).split(",")[1]);
              reader.readAsDataURL(blob);
            });
        await ctx.backendActions.uploadCv({
          candidateId: created.id,
          filename: item.cvFileName || item.fileName,
          mimeType: blob.type || "application/pdf",
          base64: b64,
        });
      }
      if (selectedJobId) {
        await ctx.backendActions.createApplication({ candidateId: created.id, positionId: selectedJobId });
      }
      await ctx.reloadData?.();
      if (currentIdx < parsedFiles.length - 1) {
        setCurrentIdx(i => i + 1);
      } else {
        setPhase("done");
      }
      return;
    } catch (e) {
      alert(e.message);
      return;
    }
    if (!selectedJobId && typedJob && setJobs) {
      const title = typedJob.split("·")[0].trim();
      const newJob = {
        id: Date.now() + currentIdx + 900,
        title,
        dept: "Unassigned",
        entity: "Karm Egypt",
        positionType: "Additional R.",
        status: "Draft",
        level: "Staff",
        headcount: 1,
        openDate: new Date().toISOString().split("T")[0],
        recruiter: "Islam Ahmed",
        hiringManager: "",
        approvedBy: "",
        approvalDate: "",
        description: "Created from CV upload. Complete requisition details before opening.",
        salaryMin: 0,
        salaryMax: 0,
      };
      setJobs(prev => [...prev, newJob]);
      selectedJobId = newJob.id;
    }
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];
    const newCand = {
      id: Date.now() + currentIdx,
      name: extracted.name || "Unknown",
      email: extracted.email || "",
      phone: extracted.phone || "",
      nationality: extracted.nationality || "",
      source: "CV Upload",
      cvUrl: item.cvUrl || "",
      cvFileName: item.cvFileName || item.fileName,
      addedDate: new Date().toISOString().split("T")[0],
      tags: extracted.skills?.slice(0, 4) || [],
      notesLog: [],
      color,
    };
    setCandidates(prev => [...prev, newCand]);
    if (selectedJobId) {
      const newApp = {
        id: Date.now() + currentIdx + 500,
        candidateId: newCand.id,
        jobId: selectedJobId,
        stage: "Applied",
        status: "Active",
        recruiter: "Islam Ahmed",
        appliedDate: new Date().toISOString().split("T")[0],
        notes: extracted.summary || "",
        daysInStage: 0,
        priority: "",
        nextAction: "Review CV",
        lastActivityAt: todayISO(),
      };
      setApplications(prev => [...prev, newApp]);
    }
    if (currentIdx < parsedFiles.length - 1) {
      setCurrentIdx(i => i + 1);
    } else {
      setPhase("done");
    }
  };

  const cur = parsedFiles[currentIdx];

  return (
    <div className="modal-overlay" onClick={closeModal}>
      <div className="modal modal-lg" style={{ maxWidth: 640 }} onClick={e => e.stopPropagation()}>

        {/* HEADER */}
        <div className="modal-header">
          <div>
            <div className="modal-title">
              {phase === "drop" && "📄 Drop CVs to Auto-Fill"}
              {phase === "parsing" && "Reading CVs..."}
              {phase === "review" && `Review Extracted Data (${currentIdx + 1} of ${parsedFiles.length})`}
              {phase === "done" && "✅ All Talent Profiles Added"}
            </div>
            {phase === "review" && <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 2, fontFamily: "var(--mono)" }}>{cur?.fileName}</div>}
          </div>
          <button className="modal-close" onClick={closeModal}>×</button>
        </div>

        <div className="modal-body">

          {/* DROP ZONE */}
          {phase === "drop" && (
            <div>
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
                onClick={() => document.getElementById("cv-file-input").click()}
                style={{
                  border: `2px dashed ${dragOver ? "var(--accent)" : "var(--border2)"}`,
                  borderRadius: "var(--radius-lg)",
                  background: dragOver ? "var(--accent-soft)" : "var(--bg3)",
                  padding: "52px 24px",
                  textAlign: "center",
                  cursor: "pointer",
                  transition: "all 0.2s",
                }}
              >
                <div style={{ fontSize: 40, marginBottom: 14 }}>📂</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text)", marginBottom: 8 }}>
                  Drag & drop CVs here
                </div>
                <div style={{ fontSize: 13, color: "var(--text3)", marginBottom: 16 }}>
                  Supports PDF and Word (.docx) — drop multiple files at once
                </div>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "var(--accent)", color: "white", padding: "8px 20px", borderRadius: "var(--radius)", fontSize: 13, fontWeight: 500 }}>
                  <Icon name="plus" size={14} /> Or click to browse files
                </div>
              </div>
              <input
                id="cv-file-input"
                type="file"
                accept=".pdf,.docx,.doc,.txt"
                multiple
                style={{ display: "none" }}
                onChange={e => handleFiles(e.target.files)}
              />
              <div style={{ marginTop: 16, padding: "12px 16px", background: "var(--bg3)", borderRadius: "var(--radius)", border: "1px solid var(--border)" }}>
                <div style={{ fontSize: 11, fontFamily: "var(--mono)", color: "var(--text3)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.5px" }}>How it works</div>
                <div style={{ fontSize: 12, color: "var(--text2)", lineHeight: 1.7 }}>
                  The upload reads text from the CV, creates a talent profile draft, and keeps the CV attached for preview/download. If the name is not found inside the resume, the name field stays blank for review.
                </div>
              </div>
            </div>
          )}

          {/* PARSING STATE */}
          {phase === "parsing" && (
            <div style={{ textAlign: "center", padding: "52px 24px" }}>
              <div style={{ fontSize: 44, marginBottom: 20, animation: "spin 1s linear infinite", display: "inline-block" }}>⚙️</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text)", marginBottom: 8 }}>Reading CV files locally</div>
              <div style={{ fontSize: 13, color: "var(--text3)" }}>Creating editable talent profile drafts and attaching each CV...</div>
              <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
            </div>
          )}

          {/* REVIEW STATE */}
          {phase === "review" && cur && (
            <div>
              {(cur.extracted.parseWarning || cur.parseError) && (
                <div className="alert alert-amber" style={{ marginBottom: 16 }}>
                  <Icon name="alert" size={14} /> {cur.extracted.parseWarning || "Candidate name was not found inside the CV. Please type it manually before confirming."}
                </div>
              )}

              {/* Progress bar for multiple files */}
              {parsedFiles.length > 1 && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text3)", marginBottom: 6, fontFamily: "var(--mono)" }}>
                    <span>Progress</span><span>{currentIdx + 1} / {parsedFiles.length} CVs</span>
                  </div>
                  <div className="mini-bar" style={{ height: 6 }}>
                    <div className="mini-bar-fill" style={{ width: `${((currentIdx) / parsedFiles.length) * 100}%`, background: "var(--accent)" }} />
                  </div>
                </div>
              )}

              {/* AI Summary banner */}
              {cur.extracted.summary && (
                <div style={{ padding: "12px 14px", background: "var(--accent-soft)", border: "1px solid rgba(79,142,247,0.2)", borderRadius: "var(--radius)", marginBottom: 18, fontSize: 12, color: "var(--text2)", lineHeight: 1.6 }}>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.5px", display: "block", marginBottom: 4 }}>Upload Summary</span>
                  {cur.extracted.summary}
                </div>
              )}

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Full name *</label>
                  <input className="form-input" value={cur.extracted.name} onChange={e => updateField("name", e.target.value)} placeholder="Full name" />
                </div>
                <div className="form-group">
                  <label className="form-label">Email</label>
                  <input className="form-input" value={cur.extracted.email} onChange={e => updateField("email", e.target.value)} placeholder="Optional" />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Phone</label>
                  <input className="form-input" value={cur.extracted.phone} onChange={e => updateField("phone", e.target.value)} placeholder="+20 1xx xxx xxxx" />
                </div>
                <div className="form-group">
                  <label className="form-label">Nationality</label>
                  <input className="form-input" value={cur.extracted.nationality} onChange={e => updateField("nationality", e.target.value)} placeholder="e.g. Egyptian" />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Current title</label>
                  <input className="form-input" value={cur.extracted.currentTitle} onChange={e => updateField("currentTitle", e.target.value)} placeholder="e.g. Solar Engineer" />
                </div>
                <div className="form-group">
                  <label className="form-label">Years of experience</label>
                  <input className="form-input" value={cur.extracted.yearsExp} onChange={e => updateField("yearsExp", e.target.value)} placeholder="e.g. 5" />
                </div>
              </div>

              {/* Skills chips */}
              {cur.extracted.skills?.length > 0 && (
                <div className="form-group">
                  <label className="form-label">Extracted skills</label>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {cur.extracted.skills.map((s, i) => (
                      <span key={i} className="chip">{s}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Job assignment */}
              <div className="form-group">
                <label className="form-label">
                  Apply to job
                  {cur.suggestedJobObj && <span style={{ marginLeft: 8, fontSize: 10, fontFamily: "var(--mono)", color: "var(--teal)" }}>Suggested: {cur.suggestedJobObj.title}</span>}
                </label>
                <input
                  className="form-input"
                  list="cv-job-options"
                  value={cur.selectedJobInput || ""}
                  onChange={e => {
                    const value = e.target.value;
                    const matched = uniqueOpenJobs.find(job => jobOptionLabel(job) === value);
                    setParsedFiles(prev => prev.map((p, i) => i === currentIdx ? { ...p, selectedJobInput: value, selectedJobId: matched?.id || "" } : p));
                  }}
                  placeholder="Type a new position or choose an open requisition"
                />
                <datalist id="cv-job-options">
                  {uniqueOpenJobs.map(j => (
                    <option key={j.id} value={jobOptionLabel(j)} />
                  ))}
                </datalist>
                <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 6 }}>
                  Choose an existing requisition, or type a new position name to create it as a draft.
                </div>
              </div>
            </div>
          )}

          {/* DONE STATE */}
          {phase === "done" && (
            <div style={{ textAlign: "center", padding: "40px 24px" }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>🎉</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text)", marginBottom: 8 }}>
                {parsedFiles.length} talent profile{parsedFiles.length > 1 ? "s" : ""} added successfully
              </div>
              <div style={{ fontSize: 13, color: "var(--text3)", marginBottom: 24 }}>
                New profiles with a selected requisition are now in Applied in the Active Hiring Pipeline.
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center" }}>
                {parsedFiles.map((p, i) => (
                  <div key={i} style={{ background: "var(--bg3)", border: "1px solid var(--green)", borderRadius: "var(--radius)", padding: "8px 14px", fontSize: 12, color: "var(--green)", display: "flex", alignItems: "center", gap: 6 }}>
                    <Icon name="check" size={12} /> {p.extracted.name || p.fileName}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* FOOTER */}
        <div className="modal-footer">
          {phase === "drop" && <button className="btn btn-ghost" onClick={closeModal}>Cancel</button>}
          {phase === "parsing" && <button className="btn btn-ghost" disabled style={{ opacity: 0.5 }}>Processing...</button>}
          {phase === "review" && (
            <>
              <button className="btn btn-ghost" onClick={closeModal}>Cancel</button>
              <button className="btn btn-ghost" onClick={() => {
                if (currentIdx < parsedFiles.length - 1) setCurrentIdx(i => i + 1);
                else setPhase("done");
              }}>Skip this CV</button>
              <button className="btn btn-primary" onClick={confirmCandidate}>
                <Icon name="check" size={14} />
                {currentIdx < parsedFiles.length - 1 ? "Confirm & Next" : "Confirm & Finish"}
              </button>
            </>
          )}
          {phase === "done" && <button className="btn btn-primary" onClick={closeModal}>Close</button>}
        </div>
      </div>
    </div>
  );
}

// ── PIPELINE PAGE ─────────────────────────────────────────────────────────────
function PipelinePage({ applications, setApplications, candidates, setCandidates, jobs, setJobs, interviews, scorecards = [], roleConfig, openModal, backendActions, reloadData }) {
  const [filterJob, setFilterJob] = useState("All");
  const [filterEntity, setFilterEntity] = useState("All");
  const [filterDept, setFilterDept] = useState("All");
  const [pipelineSearch, setPipelineSearch] = useState("");
  const [showDelayedOnly, setShowDelayedOnly] = useState(false);
  const [selectedApps, setSelectedApps] = useState([]);
  const [bulkStage, setBulkStage] = useState("HR Screening");
  const [rejectModal, setRejectModal] = useState(null);
  const [showCVParser, setShowCVParser] = useState(false);
  const [cvParserFiles, setCvParserFiles] = useState(null);
  const [cvDropActive, setCvDropActive] = useState(false);
  const [dragAppId, setDragAppId] = useState(null);
  const [dragOverStage, setDragOverStage] = useState(null);

  const openJobs = jobs.filter(j => j.status === "Open");
  const deptOptions = Array.from(new Set(jobs.map(j => j.dept).filter(Boolean))).sort();
  const canMove = !!roleConfig.canMoveCandidates;
  const canUpload = !!roleConfig.canEditCandidates;

  const activeApplications = applications.filter(a => a.status === "Active");
  const visiblePipelineApplications = applications.filter(a => a.status === "Active" || a.stage === "Rejected" || a.status === "Rejected");
  const pipelineStages = [...PIPELINE_STAGES, "Rejected"];
  const delayedApps = activeApplications.filter(a => (a.daysInStage || 0) >= 5);

  const filteredApps = visiblePipelineApplications.filter(a => {
    const job = jobs.find(j => j.id === a.jobId);
    const cand = candidates.find(c => c.id === a.candidateId);
    const q = pipelineSearch.toLowerCase();
    return (filterJob === "All" || String(a.jobId) === String(filterJob)) &&
      (filterEntity === "All" || (job && job.entity === filterEntity)) &&
      (filterDept === "All" || (job && job.dept === filterDept)) &&
      (!showDelayedOnly || (a.daysInStage || 0) >= 5) &&
      (!q || `${cand?.name} ${job?.title} ${a.stage} ${a.notes}`.toLowerCase().includes(q));
  });

  const updateApplications = (ids, updater) => {
    setApplications(prev => prev.map(a => ids.includes(a.id) ? updater(a) : a));
  };

  const moveApplications = async (ids, stage, notes = "") => {
    if (!canMove) return;
    try {
      await Promise.all(ids.map(id => backendActions.moveApplication(id, { stage: STAGE_TO_BACKEND[stage] || "applied", displayStage: stage, reason: notes })));
      await reloadData?.();
      setSelectedApps([]);
      return;
    } catch (e) {
      alert(e.message);
      return;
    }
    updateApplications(ids, a => ({
      ...a,
      stage,
      status: stage === "Rejected" ? "Rejected" : "Active",
      daysInStage: 0,
      notes: notes || a.notes,
      nextAction: stage === "HM Review" ? "Await HM feedback" : stage === "Technical Interview" ? "Schedule technical interview" : stage === "Offer" ? "Create offer" : a.nextAction,
      lastActivityAt: todayISO(),
    }));
    setSelectedApps([]);
  };

  const bulkMove = () => {
    if (bulkStage === "Rejected") {
      setRejectModal({ appIds: selectedApps });
      return;
    }
    moveApplications(selectedApps, bulkStage);
  };

  const cyclePriority = (appId) => {
    if (!canMove) return;
    setApplications(prev => prev.map(a => {
      if (a.id !== appId) return a;
      const idx = PRIORITY_TAGS.findIndex(p => p.value === a.priority);
      const next = PRIORITY_TAGS[(idx + 1) % PRIORITY_TAGS.length];
      return { ...a, priority: next.value, lastActivityAt: todayISO() };
    }));
  };

  const confirmReject = async ({ appIds, category, reason }) => {
    if (!canMove) return;
    try {
      await Promise.all(appIds.map(id => backendActions.rejectApplication(id, { reason: `${category}: ${reason}` })));
      await reloadData?.();
      setSelectedApps(prev => prev.filter(id => !appIds.includes(id)));
      setRejectModal(null);
      return;
    } catch (e) {
      alert(e.message);
      return;
    }
    updateApplications(appIds, a => ({
      ...a,
      stage: "Rejected",
      status: "Rejected",
      daysInStage: 0,
      rejectionCategory: category,
      rejectionReason: reason,
      notes: reason,
      nextAction: "",
      lastActivityAt: todayISO(),
    }));
    setSelectedApps(prev => prev.filter(id => !appIds.includes(id)));
    setRejectModal(null);
  };

  const handleDragStart = (e, appId) => {
    setDragAppId(appId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e, stage) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverStage(stage);
  };

  const handleDrop = (e, stage) => {
    e.preventDefault();
    if (dragAppId && canMove) {
      const movingApp = applications.find(a => a.id === dragAppId);
      if (movingApp && isBackwardMove(movingApp.stage, stage)) {
        const cand = candidates.find(c => c.id === movingApp.candidateId);
        const job = jobs.find(j => j.id === movingApp.jobId);
        openModal("moveStage", { app: movingApp, cand, job, targetStage: stage });
      } else {
        moveApplications([dragAppId], stage);
      }
    }
    setDragAppId(null);
    setDragOverStage(null);
  };

  const handleDragEnd = () => {
    setDragAppId(null);
    setDragOverStage(null);
  };

  const openCvParser = (files = null) => {
    setCvParserFiles(files);
    setShowCVParser(true);
  };

  const handleCvDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setCvDropActive(false);
    setDragOverStage(null);
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length) openCvParser(files);
  };

  return (
    <>
      {showCVParser && (
        <CVParserModal
          jobs={jobs}
          setJobs={setJobs}
          candidates={candidates}
          setCandidates={setCandidates}
          applications={applications}
          setApplications={setApplications}
          ctx={{ backendActions, reloadData }}
          initialFiles={cvParserFiles}
          closeModal={() => { setShowCVParser(false); setCvParserFiles(null); }}
        />
      )}
      {rejectModal && (
        <RejectCandidateModal
          appIds={rejectModal.appIds}
          applications={applications}
          candidates={candidates}
          jobs={jobs}
          onCancel={() => setRejectModal(null)}
          onConfirm={confirmReject}
        />
      )}
      <div className="page-header">
        <div>
          <div className="page-title">Active Hiring Pipeline</div>
          <div className="page-sub">
            {filteredApps.length} application{filteredApps.length === 1 ? "" : "s"} across requisitions · {filteredApps.filter(a => a.stage === "Rejected" || a.status === "Rejected").length} rejected
          </div>
        </div>
        {canUpload && (
          <button className="btn btn-primary" onClick={() => openCvParser()}>
            <span style={{ fontSize: 16, lineHeight: 1 }}>📄</span> Upload CVs
          </button>
        )}
      </div>
      <div className="page-content">
        <div
          className={`alert ${showDelayedOnly ? "alert-amber" : "alert-info"}`}
          style={{ marginBottom: 16, cursor: "pointer", alignItems: "center" }}
          onClick={() => setShowDelayedOnly(v => !v)}
        >
          <Icon name="alert" size={15} />
          <span>
            {delayedApps.length} application{delayedApps.length === 1 ? "" : "s"} delayed 5+ days
            {showDelayedOnly ? " — showing delayed only" : " — click to filter"}
          </span>
        </div>
        <RecruiterWorkbenchPanel
          applications={applications}
          candidates={candidates}
          jobs={jobs}
          interviews={interviews}
          scorecards={scorecards}
          showDelayedOnly={showDelayedOnly}
          onShowDelayedOnly={() => setShowDelayedOnly(true)}
        />
        <div className="toolbar" style={{ marginBottom: 16 }}>
          <div className="search-wrap">
            <span className="search-icon"><Icon name="search" size={14} /></span>
            <input className="search-input" placeholder="Search active applications..." value={pipelineSearch} onChange={e => setPipelineSearch(e.target.value)} />
          </div>
          <div>
            <label className="form-label">Position</label>
            <select className="form-select" style={{ width: "auto" }} value={filterJob} onChange={e => setFilterJob(e.target.value)}>
              <option value="All">All requisitions</option>
              {openJobs.map(j => <option key={j.id} value={j.id}>{j.title}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">Department</label>
            <select className="form-select" style={{ width: "auto" }} value={filterDept} onChange={e => setFilterDept(e.target.value)}>
              <option>All</option>{deptOptions.map(d => <option key={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">Entity</label>
            <select className="form-select" style={{ width: "auto" }} value={filterEntity} onChange={e => setFilterEntity(e.target.value)}>
              <option>All</option>{ENTITIES.map(e => <option key={e}>{e}</option>)}
            </select>
          </div>
          {canMove && selectedApps.length > 0 && (
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span className="badge badge-blue">{selectedApps.length} selected</span>
              <select className="form-select" style={{ width: 150 }} value={bulkStage} onChange={e => setBulkStage(e.target.value)}>
                {PIPELINE_STAGES.map(stage => <option key={stage}>{stage}</option>)}
                <option>Rejected</option>
              </select>
              <button className="btn btn-ghost btn-sm" onClick={bulkMove}>Move multiple</button>
              <button className="btn btn-ghost btn-sm" onClick={() => moveApplications(selectedApps, "HM Review")}>Shortlist multiple</button>
              <button className="btn btn-danger btn-sm" onClick={() => setRejectModal({ appIds: selectedApps })}>Reject multiple</button>
            </div>
          )}
        </div>

        <div className="kanban">
          {pipelineStages.map(stage => {
            const stageApps = filteredApps.filter(a => a.stage === stage);
            const isApplied = stage === "Applied";
            const isRejectedStage = stage === "Rejected";
            const isDragTarget = dragOverStage === stage;
            return (
              <div
                key={stage}
                className="kanban-col"
                style={{ outline: isDragTarget ? `2px solid var(--accent)` : "none", transition: "outline 0.1s" }}
                onDragOver={e => !isRejectedStage && handleDragOver(e, stage)}
                onDrop={e => !isRejectedStage && handleDrop(e, stage)}
                onDragLeave={() => setDragOverStage(null)}
              >
                <div className="kanban-col-header">
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <div className="kanban-stage-dot" style={{ background: stageColor(stage) }} />
                    <span className="kanban-col-title">{stage}</span>
                  </div>
                  <span className="kanban-col-count">{stageApps.length}</span>
                </div>
                <div className="kanban-col-body">
                  {/* CV drop zone in Applied column */}
                  {isApplied && canUpload && (
                    <div
                      onClick={() => openCvParser()}
                      onDragOver={e => { e.preventDefault(); e.stopPropagation(); setCvDropActive(true); }}
                      onDragLeave={e => { e.preventDefault(); e.stopPropagation(); setCvDropActive(false); }}
                      onDrop={handleCvDrop}
                      style={{ border: `1.5px dashed ${cvDropActive ? "var(--accent)" : "var(--border2)"}`, borderRadius: "var(--radius)", padding: "12px 8px", textAlign: "center", cursor: "pointer", marginBottom: 6, transition: "all 0.15s", background: cvDropActive ? "var(--accent-soft)" : "transparent" }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.background = "var(--accent-soft)"; }}
                      onMouseLeave={e => { if (!cvDropActive) { e.currentTarget.style.borderColor = "var(--border2)"; e.currentTarget.style.background = "transparent"; } }}
                    >
                      <div style={{ fontSize: 18, marginBottom: 4 }}>📄</div>
                      <div style={{ fontSize: 10, color: "var(--text3)", fontFamily: "var(--mono)", lineHeight: 1.4 }}>Drop CV here<br />to auto-parse</div>
                    </div>
                  )}

                  {/* Drag hint */}
                  {isDragTarget && dragAppId && (
                    <div style={{ border: "2px dashed var(--accent)", borderRadius: "var(--radius)", padding: "20px 8px", textAlign: "center", background: "var(--accent-soft)", marginBottom: 6 }}>
                      <div style={{ fontSize: 11, color: "var(--accent)", fontWeight: 500 }}>Drop here → {stage}</div>
                    </div>
                  )}

                  {stageApps.map(app => {
                    const cand = candidates.find(c => c.id === app.candidateId);
                    const job = jobs.find(j => j.id === app.jobId);
                    if (!cand) return null;
                    const isDragging = dragAppId === app.id;
                    const priority = getPriorityTag(app.priority);
                    const scheduledInterview = interviews
                      .filter(i => i.applicationId === app.id && i.status === "Scheduled")
                      .sort((a, b) => String(a.scheduledAt).localeCompare(String(b.scheduledAt)))[0];
                    const delayColor = app.daysInStage >= 5 ? "var(--red)" : app.daysInStage >= 3 ? "var(--amber)" : "var(--text3)";
                    const delayBorder = app.daysInStage >= 5 ? "var(--red)" : app.daysInStage >= 3 ? "var(--amber)" : undefined;
                    const delayLabel = app.daysInStage >= 5 ? "Delayed" : app.daysInStage >= 3 ? "Watch" : "Days";
                    const isTopCandidate = app.priority === "Top candidate";
                    const isDelayed = app.daysInStage >= 5;
                    const isRejectedApp = app.stage === "Rejected" || app.status === "Rejected";
                    const canActOnApp = canMove && !isRejectedApp;
                    return (
                      <div
                        key={app.id}
                        className="kanban-card"
                        draggable={canActOnApp}
                        onDragStart={e => handleDragStart(e, app.id)}
                        onDragEnd={handleDragEnd}
                        onClick={() => !isDragging && canActOnApp && openModal("moveStage", { app, cand, job })}
                        style={{
                          opacity: isDragging ? 0.4 : 1,
                          cursor: canActOnApp ? "grab" : "default",
                          transition: "opacity 0.15s",
                          borderColor: isRejectedApp ? "var(--red)" : isTopCandidate ? "var(--amber)" : delayBorder,
                          borderWidth: isDelayed || isTopCandidate ? 2 : 1,
                          boxShadow: isTopCandidate ? "0 0 0 3px var(--amber-soft)" : undefined,
                          transform: isDelayed ? "scale(1.015)" : undefined,
                        }}
                      >
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: app.priority || scheduledInterview ? 8 : 0 }} onClick={e => e.stopPropagation()}>
                          {app.priority ? (
                            <button
                              className="badge"
                              onClick={() => canActOnApp && cyclePriority(app.id)}
                              style={{ border: `1px solid ${priority.color}`, color: priority.color, background: priority.bg, cursor: canActOnApp ? "pointer" : "default" }}
                              title="Click to change priority"
                            >
                              {app.priority === "Top candidate" ? "⭐" : app.priority === "Urgent" ? "🔥" : "🟡"} {priority.label}
                            </button>
                          ) : (
                            <button className="badge badge-gray" onClick={() => canActOnApp && cyclePriority(app.id)} style={{ cursor: canActOnApp ? "pointer" : "default" }} title="Add priority">
                              Add priority
                            </button>
                          )}
                          {isRejectedApp && <span className="badge badge-red">Rejected</span>}
                          {scheduledInterview && (
                            <span className="badge badge-blue">📅 {formatDisplayDate(scheduledInterview.scheduledAt)}</span>
                          )}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                          {canActOnApp && (
                            <input
                              type="checkbox"
                              checked={selectedApps.includes(app.id)}
                              onChange={e => { e.stopPropagation(); setSelectedApps(prev => prev.includes(app.id) ? prev.filter(id => id !== app.id) : [...prev, app.id]); }}
                              onClick={e => e.stopPropagation()}
                              style={{ accentColor: "var(--accent)" }}
                            />
                          )}
                          <div style={{ width: 24, height: 24, borderRadius: "50%", background: cand.color + "22", color: cand.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, flexShrink: 0 }}>{initials(cand.name)}</div>
                          <span className="kanban-card-name">{cand.name}</span>
                          {canActOnApp && <span style={{ marginLeft: "auto", color: "var(--text3)", fontSize: 14, cursor: "grab" }}>⠿</span>}
                        </div>
                        <div className="kanban-card-job">{job?.title}</div>
                        {app.nextAction && (
                          <div style={{ fontSize: 11, color: "var(--text2)", marginTop: 6 }}>
                            Next: {app.nextAction}
                          </div>
                        )}
                        <div className="kanban-card-meta">
                          <span className="kanban-card-days" style={{ color: delayColor }}>{delayLabel}: {app.daysInStage}d in stage</span>
                          <span className="tag" style={{ fontSize: 9 }}>{job?.entity?.split(" ")[0] || "—"}</span>
                        </div>
                        <div style={{ fontSize: 10, color: "var(--text3)", fontFamily: "var(--mono)", marginTop: 6 }}>
                          {formatRelativeActivity(app.lastActivityAt, app.daysInStage)}
                        </div>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }} onClick={e => e.stopPropagation()}>
                          <button className="btn btn-ghost btn-sm" onClick={() => openModal("viewCandidate", { candidate: cand, activeApp: app, activeJob: job })}>View Candidate</button>
                          {canActOnApp && <button className="btn btn-ghost btn-sm" onClick={() => openModal("moveStage", { app, cand, job })}>Move</button>}
                          {canActOnApp && <button className="btn btn-ghost btn-sm" onClick={() => moveApplications([app.id], "HM Review")}>Shortlist</button>}
                          {canActOnApp && <button className="btn btn-danger btn-sm" onClick={() => setRejectModal({ appIds: [app.id] })}>Reject</button>}
                        </div>
                      </div>
                    );
                  })}
                  {stageApps.length === 0 && !isApplied && !isDragTarget && (
                    <div style={{ padding: "20px 0", textAlign: "center", color: "var(--text3)", fontSize: 11 }}>Empty</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

function RejectCandidateModal({ appIds, applications, candidates, jobs, onCancel, onConfirm }) {
  const [category, setCategory] = useState("Technical");
  const [reason, setReason] = useState("");
  const selected = applications
    .filter(app => appIds.includes(app.id))
    .map(app => ({
      app,
      cand: candidates.find(c => c.id === app.candidateId),
      job: jobs.find(j => j.id === app.jobId),
    }));

  const submit = () => {
    if (!reason.trim()) return;
    onConfirm({ appIds, category, reason: reason.trim() });
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="modal-title">Reject application{appIds.length > 1 ? "s" : ""}</div>
            <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 2 }}>
              Reason is required before rejection is saved.
            </div>
          </div>
          <button className="modal-close" onClick={onCancel}>×</button>
        </div>
        <div className="modal-body">
          <div style={{ background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 12, marginBottom: 16 }}>
            {selected.slice(0, 4).map(({ app, cand, job }) => (
              <div key={app.id} style={{ fontSize: 12, color: "var(--text2)", marginBottom: 5 }}>
                <strong style={{ color: "var(--text)" }}>{cand?.name}</strong> · {job?.title}
              </div>
            ))}
            {selected.length > 4 && <div style={{ fontSize: 11, color: "var(--text3)" }}>+ {selected.length - 4} more</div>}
          </div>
          <div className="form-group">
            <label className="form-label">Category *</label>
            <select className="form-select" value={category} onChange={e => setCategory(e.target.value)}>
              {["Technical", "Culture", "Salary", "No show"].map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Reason *</label>
            <textarea
              className="form-textarea"
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Add the rejection reason..."
            />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
          <button className="btn btn-danger" onClick={submit} disabled={!reason.trim()} style={{ opacity: reason.trim() ? 1 : 0.5 }}>
            Confirm rejection
          </button>
        </div>
      </div>
    </div>
  );
}

// ── INTERVIEWS PAGE ───────────────────────────────────────────────────────────
function InterviewsPage({ interviews, setInterviews, applications, candidates, jobs, scorecards, roleConfig, openModal, backendActions, reloadData }) {
  const [tab, setTab] = useState("scheduled");
  const [deletingInterviewId, setDeletingInterviewId] = useState(null);

  const canSchedule = !!roleConfig.canScheduleInterviews;
  const canScore = true;
  const canDelete = !!roleConfig.canDeleteRecords;

  const enrichedInterviews = interviews.filter(i => i.status !== "Cancelled").map(i => {
    const app = applications.find(a => a.id === i.applicationId);
    const cand = app ? candidates.find(c => c.id === app.candidateId) : null;
    const job = app ? jobs.find(j => j.id === app.jobId) : null;
    const sc = scorecards.find(s => s.applicationId === i.applicationId);
    return { ...i, app, cand, job, sc };
  }).filter(i => i.cand);

  const scheduled = enrichedInterviews.filter(i => i.status === "Scheduled");
  const completed = enrichedInterviews.filter(i => i.status === "Completed");
  const displayed = tab === "scheduled" ? scheduled : completed;

  const deleteInterview = async (interview) => {
    if (!canDelete || !backendActions?.deleteInterview) return;
    const candidateName = interview.cand?.name || "this candidate";
    const interviewDate = formatDisplayDate(interview.scheduledAt);
    if (!window.confirm(`Delete the scheduled interview for ${candidateName} on ${interviewDate}?\n\nThis removes the interview from the ATS for all users.`)) return;
    setDeletingInterviewId(interview.id);
    try {
      await backendActions.deleteInterview(interview.id);
      setInterviews(prev => prev.filter(item => String(item.id) !== String(interview.id)));
      await reloadData?.();
    } catch (e) {
      alert(e.message || "Could not delete this interview.");
    } finally {
      setDeletingInterviewId(null);
    }
  };

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Interviews & Scorecards</div>
          <div className="page-sub">{scheduled.length} upcoming, {completed.length} completed</div>
        </div>
        {canSchedule && <button className="btn btn-primary" onClick={() => openModal("scheduleInterview")}><Icon name="plus" size={14} /> Schedule Interview</button>}
      </div>
      <div className="page-content">
        <div className="tabs" style={{ marginBottom: 16 }}>
          <div className={`tab ${tab === "scheduled" ? "active" : ""}`} onClick={() => setTab("scheduled")}>Scheduled ({scheduled.length})</div>
          <div className={`tab ${tab === "completed" ? "active" : ""}`} onClick={() => setTab("completed")}>Completed ({completed.length})</div>
        </div>
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead><tr><th>Candidate</th><th>Job</th><th>Interview type</th><th>Date & time</th><th>Interviewer</th><th>Scorecard</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {displayed.map(i => (
                  <tr key={i.id}>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 28, height: 28, borderRadius: "50%", background: i.cand.color + "22", color: i.cand.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 600 }}>{initials(i.cand.name)}</div>
                        <span
                          className="strong"
                          onClick={() => openModal("viewCandidate", { candidate: i.cand, activeApp: i.app, activeJob: i.job })}
                          style={{ color: "var(--accent)", cursor: "pointer" }}
                        >
                          {i.cand.name}
                        </span>
                      </div>
                    </td>
                    <td style={{ color: "var(--text2)" }}>{i.job?.title}</td>
                    <td><span className="badge badge-teal">{i.type}</span></td>
                    <td style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--text2)" }}>{i.scheduledAt}</td>
                    <td style={{ color: "var(--text2)" }}>{i.interviewerId}</td>
                    <td>
                      {i.sc ? (
                        <div style={{ fontSize: 11, color: "var(--text2)", lineHeight: 1.5 }}>
                          Technical {i.sc.knowledge}/5 · Culture {i.sc.attitude}/5<br />
                          Communication {i.sc.feedback}/5 · {i.sc.recommendation}
                        </div>
                      ) : <span className="badge badge-gray">Pending</span>}
                    </td>
                    <td><span className={`badge ${i.status === "Completed" ? "badge-green" : "badge-amber"}`}>{i.status}</span></td>
                    <td>
                      <div className="row-actions">
                        {canScore && (
                          <button className="btn btn-ghost btn-sm" onClick={() => openModal("scorecard", { interview: i, app: i.app, cand: i.cand, job: i.job, existingScore: i.sc })}>
                            {i.sc ? "View Score" : "Score"}
                          </button>
                        )}
                        {canDelete && i.status === "Scheduled" && (
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => deleteInterview(i)}
                            disabled={deletingInterviewId === i.id}
                          >
                            {deletingInterviewId === i.id ? "Deleting..." : "Delete"}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {displayed.length === 0 && (
                  <tr><td colSpan={8} style={{ textAlign: "center", color: "var(--text3)", padding: "40px" }}>No interviews in this view</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}

// ── OFFERS PAGE ───────────────────────────────────────────────────────────────
// ── EMAIL NOTIFICATION SYSTEM ─────────────────────────────────────────────────
const PERSONNEL_RECIPIENT = {
  name: "Islam Ahmed",
  email: "islam.ahmed@karmsolar.com",
  role: "Personnel & Recruitment",
};

function buildEmailBody(recipientName, cand, job, offer, approvedBy, today) {
  const sep = "────────────────────────────────────";
  return [
    "Dear " + recipientName + ",",
    "",
    "This is an automated notification from Karm. ATS to confirm that an offer has been approved and requires your action.",
    "",
    sep,
    "OFFER DETAILS",
    sep,
    "Candidate name  : " + cand.name,
    "Position        : " + job.title,
    "Department      : " + job.dept,
    "Entity          : " + job.entity,
    "Proposed salary : " + offer.salary.toLocaleString() + " " + offer.currency,
    "Start date      : " + offer.startDate,
    sep,
    "APPROVAL DETAILS",
    sep,
    "Approved by     : " + approvedBy,
    "Approval date   : " + today,
    "Offer created by: " + offer.createdBy,
    sep,
    "",
    "ACTION REQUIRED",
    "Please proceed with the following steps:",
    "  1. Prepare the formal offer letter for " + cand.name,
    "  2. Initiate the onboarding documentation",
    "  3. Coordinate the start date logistics with the relevant department",
    "  4. Update social insurance and payroll records upon joining",
    "",
    "If you have any questions, please contact Yara Rashad (yara.rashad@karmsolar.com).",
    "",
    "Best regards,",
    "Karm. ATS - Automated Notification",
    "KarmSolar - Sarapis Energy",
  ].join("\n");
}

function buildOfferEmail({ cand, job, offer, approvedBy }) {
  const today = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
  return {
    to: PERSONNEL_RECIPIENT.email,
    toName: PERSONNEL_RECIPIENT.name,
    subject: "Offer Approved - " + cand.name + " | " + job.title,
    body: buildEmailBody(PERSONNEL_RECIPIENT.name, cand, job, offer, approvedBy, today),
  };
}

function EmailNotificationModal({ email, onClose, sentAt }) {
  const [copied, setCopied] = useState(false);
  const [copiedAll, setCopiedAll] = useState(false);

  const copyBody = () => {
    navigator.clipboard?.writeText(email.body).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

  const copyAll = () => {
    const full = `TO: ${email.to}\nSUBJECT: ${email.subject}\n\n${email.body}`;
    navigator.clipboard?.writeText(full).then(() => { setCopiedAll(true); setTimeout(() => setCopiedAll(false), 2500); });
  };
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg" style={{ maxWidth: 660 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--green-soft)", border: "1px solid var(--green)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon name="mail" size={14} />
              </div>
              <div>
                <div className="modal-title">Email notification sent</div>
                <div style={{ fontSize: 11, color: "var(--text3)", fontFamily: "var(--mono)", marginTop: 1 }}>{sentAt}</div>
              </div>
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body" style={{ padding: "20px 24px" }}>

          {/* Status banner */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", background: "var(--green-soft)", border: "1px solid rgba(74,222,128,0.25)", borderRadius: "var(--radius)", marginBottom: 20 }}>
            <span style={{ color: "var(--green)", display: "flex" }}><Icon name="check" size={16} /></span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: "var(--green)" }}>Notification dispatched successfully</div>
              <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 1 }}>In production this triggers your SMTP / SendGrid / EmailJS integration</div>
            </div>
          </div>

          {/* Email header fields */}
          {[
            { label: "To", value: `${email.toName} <${email.to}>` },
            { label: "Subject", value: email.subject },
          ].map(({ label, value }) => (
            <div key={label} style={{ display: "flex", gap: 12, marginBottom: 10, alignItems: "flex-start" }}>
              <div style={{ width: 52, fontSize: 11, fontFamily: "var(--mono)", color: "var(--text3)", paddingTop: 2, flexShrink: 0, textAlign: "right" }}>{label}</div>
              <div style={{ flex: 1, fontSize: 13, color: "var(--text)", background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "7px 12px" }}>{value}</div>
            </div>
          ))}

          {/* Email body */}
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <div style={{ width: 52, fontSize: 11, fontFamily: "var(--mono)", color: "var(--text3)", paddingTop: 10, flexShrink: 0, textAlign: "right" }}>Body</div>
            <div style={{ flex: 1, position: "relative" }}>
              <pre style={{ fontSize: 12, color: "var(--text2)", background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "14px 16px", whiteSpace: "pre-wrap", lineHeight: 1.7, fontFamily: "var(--mono)", maxHeight: 320, overflowY: "auto" }}>{email.body}</pre>
              <button onClick={copyBody} className="btn btn-ghost btn-sm" style={{ position: "absolute", top: 8, right: 8, fontSize: 11 }}>
                {copied ? "✓ Copied" : "Copy"}
              </button>
            </div>
          </div>

          {/* Integration note */}
          <div style={{ marginTop: 20, padding: "12px 16px", background: "var(--bg3)", borderRadius: "var(--radius)", border: "1px solid var(--border)" }}>
            <div style={{ fontSize: 11, fontFamily: "var(--mono)", color: "var(--text3)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>How to send via Classic Outlook</div>
            <div style={{ fontSize: 12, color: "var(--text2)", lineHeight: 1.6 }}>
              1. Click <strong style={{ color: "var(--text)" }}>Copy full email</strong> below → 2. Open Outlook → New Email → Paste → adjust To/Subject → Send
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Close</button>
          <button className="btn btn-ghost" onClick={copyBody}>
            {copied ? "✓ Body copied" : "Copy body"}
          </button>
          <button className="btn btn-primary" onClick={copyAll}>
            {copiedAll ? "✓ Copied! Open Outlook now" : <><Icon name="mail" size={13} /> Copy full email</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── NOTIFICATION LOG ──────────────────────────────────────────────────────────
function NotificationLog({ notifications }) {
  if (notifications.length === 0) return null;
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-header">
        <div className="card-title">Email notifications sent</div>
        <span className="badge badge-green">{notifications.length} sent</span>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Recipient</th><th>Subject</th><th>Triggered by</th><th>Sent at</th><th></th></tr></thead>
          <tbody>
            {notifications.map((n, i) => (
              <tr key={i}>
                <td>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 26, height: 26, borderRadius: "50%", background: "var(--accent-soft)", color: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 600 }}>IA</div>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text)" }}>{n.email.toName}</div>
                      <div style={{ fontSize: 11, color: "var(--text3)", fontFamily: "var(--mono)" }}>{n.email.to}</div>
                    </div>
                  </div>
                </td>
                <td style={{ fontSize: 12, color: "var(--text2)", maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.email.subject}</td>
                <td style={{ fontSize: 12, color: "var(--text2)" }}>{n.triggeredBy}</td>
                <td style={{ fontSize: 11, fontFamily: "var(--mono)", color: "var(--text3)" }}>{n.sentAt}</td>
                <td><button className="btn btn-ghost btn-sm" onClick={() => n.onView()}>View email</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function OffersPage({ offers, setOffers, applications, candidates, jobs, roleConfig, canViewSalary, openModal, backendActions, reloadData }) {
  const canCreate = !!roleConfig.canCreateOffers;
  const canApprove = hasOfferApprovalAccess(roleConfig);

  const [notifications, setNotifications] = useState([]);
  const [viewingEmail, setViewingEmail] = useState(null);
  const [savingOfferStatusId, setSavingOfferStatusId] = useState(null);

  const enriched = offers.map(o => {
    const app = applications.find(a => a.id === o.applicationId);
    const cand = app ? candidates.find(c => c.id === app.candidateId) : null;
    const job = app ? jobs.find(j => j.id === app.jobId) : null;
    return { ...o, app, cand, job };
  }).filter(o => o.cand);

  const approveOffer = (id) => {
    const offer = enriched.find(o => o.id === id);
    if (!offer) return;
    const now = new Date();
    const sentAt = now.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
    const approvedByName = roleConfig.fullName;
    const approvedDate = now.toISOString().split("T")[0];

    // Direct update — fixes the bug where approval wasn't persisting for other users
    const updatedOffers = (prevOffers) => prevOffers.map(o => o.id === id
      ? { ...o, status: "Approved", approvedBy: approvedByName, approvedDate }
      : o
    );
    setOffers(updatedOffers);

    // Build email notification
    const emailPayload = buildOfferEmail({
      cand: offer.cand,
      job: offer.job,
      offer,
      approvedBy: approvedByName,
    });

    const notif = {
      email: emailPayload,
      sentAt,
      triggeredBy: approvedByName,
      onView: () => setViewingEmail({ email: emailPayload, sentAt }),
    };

    setNotifications(prev => [notif, ...prev]);
    setViewingEmail({ email: emailPayload, sentAt });
  };

  const rejectOffer = (id) => {
    setOffers(prev => prev.map(o => o.id === id ? { ...o, status: "Rejected" } : o));
  };

  const offerStatusValue = (status) => {
    const normalized = String(status || "").toLowerCase();
    if (normalized === "accepted") return "accepted";
    if (normalized === "declined" || normalized === "rejected") return "declined";
    return "draft";
  };
  const offerStatusBadge = (status) => {
    const value = offerStatusValue(status);
    return value === "accepted" ? "badge-green" : value === "declined" ? "badge-red" : "badge-amber";
  };
  const offerStatusLabel = (status) => {
    const value = offerStatusValue(status);
    return value === "accepted" ? "Accepted" : value === "declined" ? "Declined" : "Draft";
  };
  const setOfferDecisionStatus = async (offer, nextStatus) => {
    if (!backendActions?.updateOfferCandidateStatus) return;
    setSavingOfferStatusId(offer.id);
    try {
      await backendActions.updateOfferCandidateStatus(offer.id, {
        status: nextStatus,
        reason: nextStatus === "declined" ? "Candidate declined" : undefined,
      });
      setOffers(prev => prev.map(o => o.id === offer.id ? {
        ...o,
        status: offerStatusLabel(nextStatus),
        candidateStatus: nextStatus === "accepted" ? "Accepted" : nextStatus === "declined" ? "Declined" : "Pending candidate",
      } : o));
      await reloadData?.();
    } catch (e) {
      alert(e.message || "Could not update offer status.");
    } finally {
      setSavingOfferStatusId(null);
    }
  };

  return (
    <>
      {viewingEmail && (
        <EmailNotificationModal
          email={viewingEmail.email}
          sentAt={viewingEmail.sentAt}
          onClose={() => setViewingEmail(null)}
        />
      )}
      <div className="page-header">
        <div>
          <div className="page-title">Offer Approvals</div>
          <div className="page-sub">{offers.filter(o => o.status === "Pending Approval").length} pending approval</div>
        </div>
        {canCreate && <button className="btn btn-primary" onClick={() => openModal("addOffer")}><Icon name="plus" size={14} /> Create Offer</button>}
      </div>
      <div className="page-content">
        {enriched.filter(o => o.status === "Pending Approval").length > 0 && canApprove && (
          <div className="alert alert-amber" style={{ marginBottom: 16 }}>
            <Icon name="alert" size={16} />
            <span>You have {enriched.filter(o => o.status === "Pending Approval").length} offer{enriched.filter(o => o.status === "Pending Approval").length > 1 ? "s" : ""} awaiting your approval.</span>
          </div>
        )}

        {/* NOTIFICATION LOG */}
        <NotificationLog notifications={notifications} />

        {/* APPROVAL WORKFLOW STEPS */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header">
            <div className="card-title">Approval workflow</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--text3)", fontFamily: "var(--mono)" }}>
              <Icon name="mail" size={12} />
              <span>Auto-notifies islam.ahmed@karmsolar.com on approval</span>
            </div>
          </div>
          <div className="card-body">
            <div className="offer-steps">
              {[
                { label: "Recruiter prepares offer", done: true },
                { label: "Admin reviews", done: true },
                { label: "Admin approves", active: true },
                { label: "📧 Personnel notified", notify: true },
              ].map((step, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", flex: 1 }}>
                  <div className={`offer-step ${step.done ? "done" : step.active ? "active" : ""}`} style={{ flex: "none" }}>
                    {step.done ? (
                      <div className="offer-step-done-icon"><Icon name="check" size={10} /></div>
                    ) : step.notify ? (
                      <div style={{ width: 24, height: 24, borderRadius: "50%", background: "var(--accent-soft)", border: "1px solid var(--accent)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Icon name="mail" size={11} />
                      </div>
                    ) : (
                      <div className="offer-step-num">{i + 1}</div>
                    )}
                    <span style={{ fontSize: 11, marginLeft: 6, whiteSpace: "nowrap" }}>{step.label}</span>
                  </div>
                  {i < 3 && <div className="offer-connector" />}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="table-wrap">
            <table>
              <thead><tr><th>Candidate</th><th>Job</th><th>Salary</th><th>Breakdown</th><th>Start date</th><th>Candidate</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {enriched.map(o => (
                  <tr key={o.id}>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 28, height: 28, borderRadius: "50%", background: o.cand.color + "22", color: o.cand.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 600 }}>{initials(o.cand.name)}</div>
                        <span
                          className="strong"
                          onClick={() => openModal("viewCandidate", { candidate: o.cand, activeApp: o.app, activeJob: o.job })}
                          style={{ color: "var(--accent)", cursor: "pointer" }}
                        >
                          {o.cand.name}
                        </span>
                      </div>
                    </td>
                    <td style={{ color: "var(--text2)" }}>{o.job?.title}</td>
                    <td style={{ fontFamily: "var(--mono)", color: "var(--accent)", fontWeight: 500 }}>{canViewSalary ? `${o.salary.toLocaleString()} ${o.currency}` : "Restricted"}</td>
                    <td style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text2)" }}>
                      {canViewSalary ? (
                        <>
                          Basic {(o.basicSalary || Math.round((o.salary || 0) * 0.8)).toLocaleString()}<br />
                          Variable {(o.variablePay || Math.max((o.salary || 0) - Math.round((o.salary || 0) * 0.8), 0)).toLocaleString()}
                        </>
                      ) : "Restricted"}
                    </td>
                    <td style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--text2)" }}>{o.startDate}</td>
                    <td><span className={`badge ${o.candidateStatus === "Accepted" ? "badge-green" : o.candidateStatus === "Declined" || o.candidateStatus === "Rejected" ? "badge-red" : "badge-blue"}`}>{o.candidateStatus || "Pending candidate"}</span></td>
                    <td>
                      <select
                        className={`form-select badge-select ${offerStatusBadge(o.status)}`}
                        value={offerStatusValue(o.status)}
                        onChange={e => setOfferDecisionStatus(o, e.target.value)}
                        disabled={savingOfferStatusId === o.id}
                        style={{ minWidth: 120 }}
                      >
                        <option value="draft">Draft</option>
                        <option value="accepted">Accepted</option>
                        <option value="declined">Declined</option>
                      </select>
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => openModal("viewOffer", { offer: o })}>View</button>
                        {o.status === "Approved" && notifications.find(n => n.email.subject.includes(o.cand?.name)) && (
                          <button className="btn btn-ghost btn-sm" style={{ color: "var(--accent)", borderColor: "var(--accent-soft)" }}
                            onClick={() => { const n = notifications.find(nn => nn.email.subject.includes(o.cand?.name)); if (n) setViewingEmail({ email: n.email, sentAt: n.sentAt }); }}>
                            <Icon name="mail" size={12} /> Email sent
                          </button>
                        )}
                        {canApprove && o.status === "Pending Approval" && (
                          <>
                            <button className="btn btn-sm" style={{ background: "var(--green-soft)", color: "var(--green)", border: "1px solid rgba(74,222,128,0.2)" }} onClick={() => approveOffer(o.id)}>Approve</button>
                            <button className="btn btn-danger btn-sm" onClick={() => rejectOffer(o.id)}>Reject</button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {enriched.length === 0 && (
                  <tr><td colSpan={8} style={{ textAlign: "center", color: "var(--text3)", padding: "40px" }}>No offers created yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}

// ── SETTINGS PAGE ─────────────────────────────────────────────────────────────
function SettingsPage({ currentRole, roleAssignments, setRoleAssignments, ROLES_CONFIG, auditLogs, backendUsers = [], backendActions, reloadData, jobs = [], candidates = [], applications = [], offers = [], interviews = [], scorecards = [] }) {
  const defaultAccessScopeForRole = (role) => role === "admin"
    ? "all_data"
    : role === "recruiter"
      ? "recruitment_data"
      : role === "hiring_manager"
        ? "assigned_jobs"
        : "assigned_interviews";
  const roleKeyFromLabel = (role) => ({
    Admin: "admin",
    Recruiter: "recruiter",
    "Hiring Manager": "hiring_manager",
    Interviewer: "interviewer",
  }[role] || role || "recruiter");
  const accessScopeKeyFromLabel = (scope) => ({
    "All system data": "all_data",
    "All recruitment data": "recruitment_data",
    "Assigned recruitment data": "recruitment_data",
    "Assigned jobs": "assigned_jobs",
    "Assigned interviews": "assigned_interviews",
  }[scope] || scope || "recruitment_data");
  const emptyUserForm = () => ({
    fullName: "",
    email: "",
    role: "recruiter",
    accessScope: "recruitment_data",
    canViewSalary: false,
    canApproveOffers: false,
    canApproveRequisitions: false,
    isActive: true,
  });
  const applyRoleDefaults = (prev, value) => ({
    ...prev,
    role: value,
    accessScope: defaultAccessScopeForRole(value),
    canViewSalary: value === "admin" ? true : prev.canViewSalary,
    canApproveOffers: value === "admin" ? true : prev.canApproveOffers,
    canApproveRequisitions: value === "admin" ? true : prev.canApproveRequisitions,
  });
  const [activeTab, setActiveTab] = useState("users");
  const [saved, setSaved] = useState(false);
  const [localAssignments, setLocalAssignments] = useState({ ...roleAssignments });
  const [showAddUser, setShowAddUser] = useState(false);
  const [addingUser, setAddingUser] = useState(false);
  const [userError, setUserError] = useState("");
  const [newUser, setNewUser] = useState(emptyUserForm);
  const [editingUser, setEditingUser] = useState(null);
  const [savingUser, setSavingUser] = useState(false);
  const [editUserError, setEditUserError] = useState("");
  const userDirectory = backendUsers.length ? backendUsers : TEAM;

  const updateNewUser = (field, value) => {
    setNewUser(prev => field === "role" ? applyRoleDefaults(prev, value) : { ...prev, [field]: value });
  };

  const submitUser = async () => {
    setUserError("");
    const { firstName, lastName } = splitName(newUser.fullName);
    if (!firstName || !newUser.email) {
      setUserError("Name and email are required.");
      return;
    }
    setAddingUser(true);
    try {
      await backendActions.createUser({
        email: newUser.email.trim().toLowerCase(),
        firstName,
        lastName,
        role: newUser.role,
        accessScope: newUser.accessScope,
        entities: ["egypt", "cyprus", "uk", "tunisia"],
        canViewSalary: !!newUser.canViewSalary,
        canApproveOffers: !!newUser.canApproveOffers,
        canApproveRequisitions: !!newUser.canApproveRequisitions,
        isActive: true,
      });
      await reloadData();
      setShowAddUser(false);
      setNewUser(emptyUserForm());
    } catch (e) {
      setUserError(e.message);
    } finally {
      setAddingUser(false);
    }
  };

  const openEditUser = (user) => {
    const roleKey = roleKeyFromLabel(user.roleKey || user.role);
    setEditUserError("");
    setEditingUser({
      id: user.id,
      fullName: user.fullName || "",
      email: user.email || "",
      role: roleKey,
      accessScope: accessScopeKeyFromLabel(user.accessScopeKey || user.accessScope) || defaultAccessScopeForRole(roleKey),
      canViewSalary: !!user.canViewSalary || roleKey === "admin",
      canApproveOffers: !!user.canApproveOffers || roleKey === "admin",
      canApproveRequisitions: !!user.canApproveRequisitions || roleKey === "admin",
      isActive: user.active !== false,
    });
  };

  const updateEditingUser = (field, value) => {
    setEditingUser(prev => {
      if (!prev) return prev;
      return field === "role" ? applyRoleDefaults(prev, value) : { ...prev, [field]: value };
    });
  };

  const submitEditUser = async () => {
    setEditUserError("");
    if (!editingUser?.id) {
      setEditUserError("This user can only be edited after it exists in the backend.");
      return;
    }
    setSavingUser(true);
    try {
      await backendActions.updateUser(editingUser.id, {
        role: editingUser.role,
        accessScope: editingUser.accessScope,
        entities: ["egypt", "cyprus", "uk", "tunisia"],
        canViewSalary: !!editingUser.canViewSalary,
        canApproveOffers: !!editingUser.canApproveOffers,
        canApproveRequisitions: !!editingUser.canApproveRequisitions,
        isActive: !!editingUser.isActive,
      });
      await reloadData();
      setEditingUser(null);
    } catch (e) {
      setEditUserError(e.message || "Could not update user.");
    } finally {
      setSavingUser(false);
    }
  };

  const saveAssignments = () => {
    setRoleAssignments(localAssignments);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const changed = JSON.stringify(localAssignments) !== JSON.stringify(roleAssignments);

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Settings</div>
          <div className="page-sub">Manage role assignments, pipeline stages, and entities</div>
        </div>
      </div>
      <div className="page-content">
        <div className="tabs" style={{ marginBottom: 16 }}>
          {["users", "permissions", "approvals", "audit", "product audit", "templates", "automation", "security", "roadmap", "stages", "entities"].map(t => (
            <div key={t} className={`tab ${activeTab === t ? "active" : ""}`} onClick={() => setActiveTab(t)} style={{ textTransform: "capitalize" }}>{t}</div>
          ))}
        </div>

        {activeTab === "users" && (
          <div>
            <div className="card">
              <div className="card-header">
                <div className="card-title">All team members</div>
                <button className="btn btn-primary btn-sm" onClick={() => setShowAddUser(true)}><Icon name="plus" size={13} /> Add User</button>
              </div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Department</th><th>Access scope</th><th>Status</th><th>Salary</th><th>Offers</th><th>Requisitions</th><th></th></tr></thead>
                  <tbody>
                    {userDirectory.map((u, idx) => {
                      const assignedRole = Object.entries(localAssignments).find(([, indexes]) => (Array.isArray(indexes) ? indexes : [indexes]).includes(idx));
                      const role = backendUsers.length ? u.role : (assignedRole ? assignedRole[0] : u.role);
                      const perms = role ? { ...ROLE_PERMISSIONS[role], ...u } : u;
                      return (
                        <tr key={u.email || u.id}>
                          <td>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              <div style={{ width: 30, height: 30, borderRadius: "50%", background: u.color + "22", color: u.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600 }}>{u.initials}</div>
                              <span className="strong">{u.fullName}</span>
                            </div>
                          </td>
                          <td style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text3)" }}>{u.email}</td>
                          <td><span className="badge badge-blue">{role}</span></td>
                          <td>{u.department}</td>
                          <td><span className="tag">{u.accessScope}</span></td>
                          <td><span className={`badge ${u.active ? "badge-green" : "badge-gray"}`}>{u.active ? "Active" : "Inactive"}</span></td>
                          <td>{hasSalaryAccess(perms) ? <span style={{ color: "var(--green)" }}><Icon name="check" size={14} /></span> : <span style={{ color: "var(--text3)" }}>—</span>}</td>
                          <td>{hasOfferApprovalAccess(perms) ? <span style={{ color: "var(--green)" }}><Icon name="check" size={14} /></span> : <span style={{ color: "var(--text3)" }}>—</span>}</td>
                          <td>{hasRequisitionApprovalAccess(perms) ? <span style={{ color: "var(--green)" }}><Icon name="check" size={14} /></span> : <span style={{ color: "var(--text3)" }}>—</span>}</td>
                          <td>
                            <button className="btn btn-ghost btn-sm" onClick={() => openEditUser(u)} disabled={!u.id || !backendActions?.updateUser}>Edit</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            {showAddUser && (
              <div className="modal-overlay" onClick={() => setShowAddUser(false)}>
                <div className="modal" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
                  <div className="modal-header">
                    <div className="modal-title">Add ATS User</div>
                    <button className="modal-close" onClick={() => setShowAddUser(false)}>×</button>
                  </div>
                  <div className="modal-body">
                    {userError && <div className="alert alert-amber" style={{ marginBottom: 16 }}><Icon name="alert" size={14} />{userError}</div>}
                    <div className="form-group">
                      <label className="form-label">Full name *</label>
                      <input className="form-input" value={newUser.fullName} onChange={e => updateNewUser("fullName", e.target.value)} placeholder="e.g. Heba Selim" />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Company email *</label>
                      <input className="form-input" type="email" value={newUser.email} onChange={e => updateNewUser("email", e.target.value)} placeholder="heba.selim@karmsolar.com" />
                    </div>
                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label">Role</label>
                        <select className="form-select" value={newUser.role} onChange={e => updateNewUser("role", e.target.value)}>
                          <option value="admin">Admin</option>
                          <option value="recruiter">Recruiter</option>
                          <option value="hiring_manager">Hiring Manager</option>
                          <option value="interviewer">Interviewer</option>
                        </select>
                      </div>
                      <div className="form-group">
                        <label className="form-label">Access scope</label>
                        <select className="form-select" value={newUser.accessScope} onChange={e => updateNewUser("accessScope", e.target.value)}>
                          <option value="all_data">All system data</option>
                          <option value="recruitment_data">All recruitment data</option>
                          <option value="assigned_jobs">Assigned jobs</option>
                          <option value="assigned_interviews">Assigned interviews</option>
                        </select>
                      </div>
                    </div>
                    <div style={{ display: "grid", gap: 10 }}>
                      <label className="chip" style={{ cursor: "pointer" }}><input type="checkbox" checked={newUser.canViewSalary} onChange={e => updateNewUser("canViewSalary", e.target.checked)} /> Can view salary details</label>
                      <label className="chip" style={{ cursor: "pointer" }}><input type="checkbox" checked={newUser.canApproveOffers} onChange={e => updateNewUser("canApproveOffers", e.target.checked)} /> Can approve offers</label>
                      <label className="chip" style={{ cursor: "pointer" }}><input type="checkbox" checked={newUser.canApproveRequisitions} onChange={e => updateNewUser("canApproveRequisitions", e.target.checked)} /> Can approve requisitions</label>
                    </div>
                  </div>
                  <div className="modal-footer">
                    <button className="btn btn-ghost" onClick={() => setShowAddUser(false)}>Cancel</button>
                    <button className="btn btn-primary" onClick={submitUser} disabled={addingUser}>{addingUser ? "Adding..." : "Add User"}</button>
                  </div>
                </div>
              </div>
            )}
            {editingUser && (
              <div className="modal-overlay" onClick={() => setEditingUser(null)}>
                <div className="modal" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
                  <div className="modal-header">
                    <div className="modal-title">Edit ATS User</div>
                    <button className="modal-close" onClick={() => setEditingUser(null)}>×</button>
                  </div>
                  <div className="modal-body">
                    {editUserError && <div className="alert alert-amber" style={{ marginBottom: 16 }}><Icon name="alert" size={14} />{editUserError}</div>}
                    <div className="form-group">
                      <label className="form-label">Full name</label>
                      <input className="form-input" value={editingUser.fullName} readOnly />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Company email</label>
                      <input className="form-input" value={editingUser.email} readOnly />
                    </div>
                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label">Role</label>
                        <select className="form-select" value={editingUser.role} onChange={e => updateEditingUser("role", e.target.value)}>
                          <option value="admin">Admin</option>
                          <option value="recruiter">Recruiter</option>
                          <option value="hiring_manager">Hiring Manager</option>
                          <option value="interviewer">Interviewer</option>
                        </select>
                      </div>
                      <div className="form-group">
                        <label className="form-label">Access scope</label>
                        <select className="form-select" value={editingUser.accessScope} onChange={e => updateEditingUser("accessScope", e.target.value)}>
                          <option value="all_data">All system data</option>
                          <option value="recruitment_data">All recruitment data</option>
                          <option value="assigned_jobs">Assigned jobs</option>
                          <option value="assigned_interviews">Assigned interviews</option>
                        </select>
                      </div>
                    </div>
                    <div style={{ display: "grid", gap: 10 }}>
                      <label className="chip" style={{ cursor: "pointer" }}><input type="checkbox" checked={editingUser.isActive} onChange={e => updateEditingUser("isActive", e.target.checked)} /> Active user</label>
                      <label className="chip" style={{ cursor: "pointer" }}><input type="checkbox" checked={editingUser.canViewSalary} onChange={e => updateEditingUser("canViewSalary", e.target.checked)} /> Can view salary details</label>
                      <label className="chip" style={{ cursor: "pointer" }}><input type="checkbox" checked={editingUser.canApproveOffers} onChange={e => updateEditingUser("canApproveOffers", e.target.checked)} /> Can approve offers</label>
                      <label className="chip" style={{ cursor: "pointer" }}><input type="checkbox" checked={editingUser.canApproveRequisitions} onChange={e => updateEditingUser("canApproveRequisitions", e.target.checked)} /> Can approve requisitions</label>
                    </div>
                  </div>
                  <div className="modal-footer">
                    <button className="btn btn-ghost" onClick={() => setEditingUser(null)}>Cancel</button>
                    <button className="btn btn-primary" onClick={submitEditUser} disabled={savingUser}>{savingUser ? "Saving..." : "Save User"}</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "permissions" && (
          <div className="card">
            <div className="card-header">
              <div className="card-title">Permission control</div>
              <div style={{ fontSize: 11, color: "var(--text3)", fontFamily: "var(--mono)" }}>Prototype matrix for access rules</div>
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Role</th><th>Scope</th><th>Move applications</th><th>Approve offers</th><th>Approve reqs</th><th>Create requisitions</th><th>Manage users</th><th>Salary visible</th></tr></thead>
                <tbody>
                  {ROLE_LIST.map(role => {
                    const perms = ROLE_PERMISSIONS[role];
                    const Yes = ({ ok }) => ok ? <span style={{ color: "var(--green)" }}><Icon name="check" size={14} /></span> : <span style={{ color: "var(--text3)" }}>—</span>;
                    return (
                      <tr key={role}>
                        <td className="strong">{role}</td>
                        <td>{role === "Admin" ? "All data" : role === "Recruiter" ? "Recruitment data" : role === "Hiring Manager" ? "Assigned jobs / department" : "Assigned interviews"}</td>
                        <td><Yes ok={perms.canMoveCandidates} /></td>
                        <td><Yes ok={perms.canApproveOffer} /></td>
                        <td><Yes ok={perms.canApproveRequisition} /></td>
                        <td><Yes ok={perms.canCreateRequisitions} /></td>
                        <td><Yes ok={perms.canManageUsers} /></td>
                        <td><Yes ok={perms.canViewSalary} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="card-body">
              <div className="alert alert-info">
                <Icon name="alert" size={14} />
                <span>In the production version, this matrix should be enforced by login, not the demo role switcher. For this test build it documents who should be able to do each action.</span>
              </div>
            </div>
          </div>
        )}

        {activeTab === "approvals" && (
          <div className="card">
            <div className="card-header"><div className="card-title">Approval rules</div></div>
            <div className="card-body">
              {[
                ["Hiring request", "Manager submits → HR reviews → Admin approval → requisition created"],
                ["Requisition approval", "Admin and authorized Hiring Managers can approve assigned requisitions"],
                ["Offer approval", "Admin and users with Can approve offers can approve assigned offers"],
                ["Sensitive salary data", "Hidden by default from Hiring Managers and Interviewers; visible only to Admin and authorized Recruiters"],
              ].map(([name, rule]) => (
                <div key={name} style={{ padding: "12px 0", borderBottom: "1px solid var(--border)" }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", marginBottom: 3 }}>{name}</div>
                  <div style={{ fontSize: 12, color: "var(--text2)" }}>{rule}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "audit" && (
          <div className="card">
            <div className="card-header">
              <div className="card-title">Audit trail</div>
              <span className="badge badge-blue">{auditLogs.length} logs</span>
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Action</th><th>User</th><th>Date/time</th><th>Old value</th><th>New value</th></tr></thead>
                <tbody>
                  {auditLogs.slice(0, 80).map((log, i) => (
                    <tr key={`${log.action}-${i}`}>
                      <td className="strong">{log.action}</td>
                      <td>{log.user || "—"}</td>
                      <td style={{ fontFamily: "var(--mono)", color: "var(--text3)" }}>{formatDisplayDate(log.at)}</td>
                      <td>{log.oldValue || "—"}</td>
                      <td>{log.newValue || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === "product audit" && (
          <div data-testid="product-audit-page">
            <EnterpriseReadinessPanel
              jobs={jobs}
              candidates={candidates}
              applications={applications}
              offers={offers}
              interviews={interviews}
              scorecards={scorecards}
              auditLogs={auditLogs}
            />
            <RoadmapPanel />
          </div>
        )}

        {activeTab === "templates" && <CommunicationTemplatesPanel />}

        {activeTab === "automation" && <AutomationPreferencesPanel />}

        {activeTab === "security" && <AuditSecurityPanel />}

        {activeTab === "roadmap" && <RoadmapPanel />}

        {activeTab === "stages" && (
          <div className="card">
            <div className="card-header"><div className="card-title">Pipeline stages</div></div>
            <div className="card-body">
              {STAGES.map((stage, i) => (
                <div key={stage} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: i < STAGES.length - 1 ? "1px solid var(--border)" : "none" }}>
                  <div style={{ width: 24, height: 24, borderRadius: "50%", background: "var(--bg4)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontFamily: "var(--mono)", color: "var(--text3)" }}>{i + 1}</div>
                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: stageColor(stage) }} />
                  <span style={{ fontSize: 13, color: "var(--text)" }}>{stage}</span>
                  <span className={`badge ${stageBadge(stage)}`} style={{ marginLeft: "auto" }}>{i < 7 ? "Active" : "Terminal"}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "entities" && (
          <div className="card">
            <div className="card-header"><div className="card-title">Company entities</div></div>
            <div className="card-body">
              {[
            { name: "HoldCo. (UK)",      country: "United Kingdom", type: "Group holding company",       color: "#4f8ef7" },
            { name: "Sub HoldCo. (NL)",  country: "Netherlands",    type: "Sub-holding entity",           color: "#a78bfa" },
            { name: "Karm Egypt",        country: "Egypt",          type: "Solar EPC, O&M & Operations",  color: "#2dd4b4" },
            { name: "Karm Cyprus",       country: "Cyprus",         type: "Energy trading & development",  color: "#f59e0b" },
            { name: "Karm Tunisia",      country: "Tunisia",        type: "North Africa expansion",        color: "#fb923c" },
          ].map(e => (
                <div key={e.name} style={{ display: "flex", alignItems: "center", gap: 16, padding: "16px", background: "var(--bg3)", borderRadius: "var(--radius)", marginBottom: 10, border: "1px solid var(--border)" }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: e.color + "22", border: `1px solid ${e.color}44`, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 14, color: e.color }}>{e.name[0]}</div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>{e.name}</div>
                    <div style={{ fontSize: 12, color: "var(--text3)" }}>{e.type} · {e.country}</div>
                  </div>
                  <span className="badge badge-green" style={{ marginLeft: "auto" }}>Active</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ── MODALS ────────────────────────────────────────────────────────────────────
function OpenRequisitionsModal({ data, closeModal, ctx }) {
  const rows = data?.rows || [];
  const [departmentFilter, setDepartmentFilter] = useState("All");
  const departmentDisplayName = department => department === "O&M" ? "O&M Distribution" : department;
  const departmentOptions = Array.from(new Set(rows.map(row => row.department).filter(Boolean))).sort();
  const filteredRows = rows.filter(row => departmentFilter === "All" || row.department === departmentFilter);
  const openJobsPage = () => {
    closeModal();
    ctx.setPage?.("jobs");
  };

  return (
    <div className="modal-overlay" onClick={closeModal}>
      <div className="modal modal-lg" style={{ maxWidth: 860 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="modal-title">Open Requisitions</div>
            <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 2 }}>
              {filteredRows.length} shown · {rows.length} open · {data?.totalRequisitions || 0} total requisition{data?.totalRequisitions === 1 ? "" : "s"}
            </div>
          </div>
          <button className="modal-close" onClick={closeModal}>×</button>
        </div>
        <div className="modal-body">
          {rows.length === 0 ? (
            <div className="empty-panel">No open requisitions are currently visible.</div>
          ) : (
            <div>
              <div className="toolbar" style={{ marginBottom: 12 }}>
                <div>
                  <label className="form-label">Department</label>
                  <select className="form-select" value={departmentFilter} onChange={event => setDepartmentFilter(event.target.value)}>
                    <option>All</option>
                    {departmentOptions.map(department => <option key={department} value={department}>{departmentDisplayName(department)}</option>)}
                  </select>
                </div>
              </div>
              {filteredRows.length === 0 ? (
                <div className="empty-panel">No open requisitions match this department.</div>
              ) : (
                <div className="table-wrap">
                  <table className="table-compact">
                    <thead>
                      <tr><th>Role</th><th>Department / entity</th><th>Recruiter</th><th>Headcount</th><th>Active candidates</th><th>Open date</th><th></th></tr>
                    </thead>
                    <tbody>
                      {filteredRows.map(row => (
                        <tr key={row.id}>
                          <td className="strong">{row.title}</td>
                          <td>{departmentDisplayName(row.department)}<br /><small style={{ color: "var(--text3)" }}>{row.entity}</small></td>
                          <td>{row.recruiter}</td>
                          <td style={{ fontFamily: "var(--mono)", color: "var(--text2)" }}>{row.headcount}</td>
                          <td><span className={`badge ${row.activeCandidates > 0 ? "badge-blue" : "badge-amber"}`}>{row.activeCandidates}</span></td>
                          <td style={{ fontFamily: "var(--mono)", color: "var(--text2)" }}>{formatDisplayDate(row.openDate)}</td>
                          <td><button className="btn btn-ghost btn-sm" onClick={openJobsPage}>View requisitions</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={closeModal}>Close</button>
          <button className="btn btn-primary" onClick={openJobsPage}>Open Job Requisitions</button>
        </div>
      </div>
    </div>
  );
}

function NewJoinersModal({ data, closeModal, ctx }) {
  const rows = data?.rows || [];

  return (
    <div className="modal-overlay" onClick={closeModal}>
      <div className="modal modal-lg" style={{ maxWidth: 760 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="modal-title">New Joiners This Month</div>
            <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 2 }}>
              {rows.length} month-to-date hire{rows.length === 1 ? "" : "s"} · {data?.totalHired || 0} total hired record{data?.totalHired === 1 ? "" : "s"}
            </div>
          </div>
          <button className="modal-close" onClick={closeModal}>×</button>
        </div>
        <div className="modal-body">
          {rows.length === 0 ? (
            <div className="empty-panel">No new joiners are recorded for this month yet.</div>
          ) : (
            <div className="table-wrap">
              <table className="table-compact">
                <thead>
                  <tr><th>New joiner</th><th>Role</th><th>Department / entity</th><th>Recruiter</th><th>Hire date</th><th></th></tr>
                </thead>
                <tbody>
                  {rows.map(row => (
                    <tr key={row.id}>
                      <td className="strong">{row.candidateName}</td>
                      <td>{row.roleTitle}</td>
                      <td>{row.department}<br /><small style={{ color: "var(--text3)" }}>{row.entity}</small></td>
                      <td>{row.recruiter}</td>
                      <td style={{ fontFamily: "var(--mono)", color: "var(--text2)" }}>{formatDisplayDate(row.hireDate)}</td>
                      <td>
                        {row.candidate && (
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => ctx.openModal("viewCandidate", { candidate: row.candidate, activeApp: row.app, activeJob: row.job })}
                          >
                            View
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={closeModal}>Close</button>
        </div>
      </div>
    </div>
  );
}

function InterviewsThisWeekModal({ data, closeModal, ctx }) {
  const rows = data?.rows || [];
  const openInterviewsPage = () => {
    closeModal();
    ctx.setPage?.("interviews");
  };

  return (
    <div className="modal-overlay" onClick={closeModal}>
      <div className="modal modal-lg" style={{ maxWidth: 820 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="modal-title">Scheduled Interviews</div>
            <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 2 }}>
              {rows.length} scheduled interview{rows.length === 1 ? "" : "s"} · {data?.activeApplications || 0} active application{data?.activeApplications === 1 ? "" : "s"}
            </div>
          </div>
          <button className="modal-close" onClick={closeModal}>×</button>
        </div>
        <div className="modal-body">
          {rows.length === 0 ? (
            <div className="empty-panel">No interviews are scheduled yet.</div>
          ) : (
            <div className="table-wrap">
              <table className="table-compact">
                <thead>
                  <tr><th>Candidate</th><th>Role</th><th>Department / entity</th><th>Interviewer</th><th>Date & time</th><th>Status</th><th></th></tr>
                </thead>
                <tbody>
                  {rows.map(row => (
                    <tr key={row.id}>
                      <td className="strong">{row.candidateName}</td>
                      <td>{row.roleTitle}<br /><small style={{ color: "var(--text3)" }}>{row.interviewType}</small></td>
                      <td>{row.department}<br /><small style={{ color: "var(--text3)" }}>{row.entity}</small></td>
                      <td>{row.interviewer}<br /><small style={{ color: "var(--text3)" }}>{row.recruiter}</small></td>
                      <td style={{ fontFamily: "var(--mono)", color: "var(--text2)" }}>{formatDisplayDate(row.scheduledAt)}</td>
                      <td><span className={`badge ${row.status === "Completed" ? "badge-green" : "badge-blue"}`}>{row.status}</span></td>
                      <td>
                        {row.candidate && (
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => ctx.openModal("viewCandidate", { candidate: row.candidate, activeApp: row.app, activeJob: row.job })}
                          >
                            View
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={closeModal}>Close</button>
          <button className="btn btn-primary" onClick={openInterviewsPage}>{rows.length ? "Open Interviews" : "Schedule Interview"}</button>
        </div>
      </div>
    </div>
  );
}

function OfferAcceptanceModal({ data, closeModal, ctx }) {
  const rows = data?.rows || [];
  const openOffersPage = () => {
    closeModal();
    ctx.setPage?.("offers");
  };

  return (
    <div className="modal-overlay" onClick={closeModal}>
      <div className="modal modal-lg" style={{ maxWidth: 840 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="modal-title">Offer Acceptance Rate</div>
            <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 2 }}>
              {data?.rate ?? "N/A"}% accepted · {data?.accepted || 0} accepted · {data?.declined || 0} declined
            </div>
          </div>
          <button className="modal-close" onClick={closeModal}>×</button>
        </div>
        <div className="modal-body">
          {rows.length === 0 ? (
            <div className="empty-panel">No accepted or declined offers are recorded yet.</div>
          ) : (
            <div className="table-wrap">
              <table className="table-compact">
                <thead>
                  <tr><th>Candidate</th><th>Role</th><th>Department / entity</th><th>Recruiter</th><th>Decision</th><th>Last update</th><th></th></tr>
                </thead>
                <tbody>
                  {rows.map(row => (
                    <tr key={row.id}>
                      <td className="strong">{row.candidateName}</td>
                      <td>{row.roleTitle}</td>
                      <td>{row.department}<br /><small style={{ color: "var(--text3)" }}>{row.entity}</small></td>
                      <td>{row.recruiter}</td>
                      <td>
                        <span className={`badge ${row.decision === "Accepted" ? "badge-green" : "badge-red"}`}>{row.decision}</span>
                        <br />
                        <small style={{ color: "var(--text3)" }}>{row.candidateStatus || row.offerStatus}</small>
                      </td>
                      <td style={{ fontFamily: "var(--mono)", color: "var(--text2)" }}>{formatDisplayDate(row.decisionDate)}</td>
                      <td>
                        {row.offer ? (
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => ctx.openModal("viewOffer", { offer: { ...row.offer, cand: row.candidate, app: row.app, job: row.job } })}
                          >
                            View offer
                          </button>
                        ) : row.candidate ? (
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => ctx.openModal("viewCandidate", { candidate: row.candidate, activeApp: row.app, activeJob: row.job })}
                          >
                            View
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={closeModal}>Close</button>
          <button className="btn btn-primary" onClick={openOffersPage}>Open Offers</button>
        </div>
      </div>
    </div>
  );
}

function PendingOffersModal({ data, closeModal, ctx }) {
  const rows = data?.rows || [];
  const [deletingCandidateId, setDeletingCandidateId] = useState(null);
  const canDelete = !!ctx.roleConfig?.canDeleteRecords;

  const deletePendingCandidate = async (row) => {
    if (!row?.candidate?.id || !canDelete || !ctx.backendActions?.deleteCandidate) return;
    const ok = window.confirm(`Delete ${row.candidateName || "this candidate"} from ATS?`);
    if (!ok) return;
    setDeletingCandidateId(row.candidate.id);
    try {
      await ctx.backendActions.deleteCandidate(row.candidate.id);
      await ctx.reloadData?.();
      closeModal();
    } catch (error) {
      alert(error.message || "Could not delete candidate");
    } finally {
      setDeletingCandidateId(null);
    }
  };

  return (
    <div className="modal-overlay" onClick={closeModal}>
      <div className="modal modal-lg" style={{ maxWidth: 820 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="modal-title">Pending Offers</div>
            <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 2 }}>
              {data?.offerStageCount || 0} in Offer stage · {data?.pendingRecordCount || 0} pending offer record{data?.pendingRecordCount === 1 ? "" : "s"}
            </div>
          </div>
          <button className="modal-close" onClick={closeModal}>×</button>
        </div>
        <div className="modal-body">
          {rows.length === 0 ? (
            <div className="empty-panel">No candidates are currently waiting in the offer step.</div>
          ) : (
            <div className="table-wrap">
              <table className="table-compact">
                <thead>
                  <tr><th>Candidate</th><th>Role</th><th>Department / entity</th><th>Recruiter</th><th>Offer status</th><th>Last update</th><th></th></tr>
                </thead>
                <tbody>
                  {rows.map(row => (
                    <tr key={row.id}>
                      <td className="strong">{row.candidateName}</td>
                      <td>{row.roleTitle}</td>
                      <td>{row.department}<br /><small style={{ color: "var(--text3)" }}>{row.entity}</small></td>
                      <td>{row.recruiter}</td>
                      <td>
                        <span className="badge badge-amber">{row.offerStatus}</span>
                        <br />
                        <small style={{ color: "var(--text3)" }}>{row.candidateStatus}</small>
                      </td>
                      <td style={{ fontFamily: "var(--mono)", color: "var(--text2)" }}>{formatDisplayDate(row.createdDate)}</td>
                      <td>
                        {row.offer ? (
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => ctx.openModal("viewOffer", { offer: { ...row.offer, cand: row.candidate, app: row.app, job: row.job } })}
                          >
                            View offer
                          </button>
                        ) : row.candidate ? (
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => ctx.openModal("viewCandidate", { candidate: row.candidate, activeApp: row.app, activeJob: row.job })}
                          >
                            View candidate
                          </button>
                        ) : null}
                        {canDelete && row.candidate && (
                          <button
                            className="btn btn-danger btn-sm"
                            style={{ marginLeft: 8 }}
                            onClick={() => deletePendingCandidate(row)}
                            disabled={deletingCandidateId === row.candidate.id}
                          >
                            {deletingCandidateId === row.candidate.id ? "Deleting..." : "Delete"}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={closeModal}>Close</button>
        </div>
      </div>
    </div>
  );
}

function AddHiringRequestModal({ data, closeModal, ctx }) {
  const [form, setForm] = useState({ title: "", dept: DEPARTMENTS[0], entity: ENTITIES[0], reason: "" });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const submit = async () => {
    if (!form.title || !form.reason) return;
    try {
      setSaving(true);
      if (ctx.backendActions?.createHiringRequest) {
        const created = await ctx.backendActions.createHiringRequest(form);
        ctx.setHiringRequests(prev => [created, ...prev.filter(req => req.id !== created.id)]);
        await ctx.reloadData?.();
        closeModal();
        return;
      }
      const newRequest = {
        ...form,
        id: Date.now(),
        requestedBy: ctx.roleConfig.fullName,
        status: "Pending HR Approval",
        managerApproved: true,
        hrApproved: false,
        ceoApproved: false,
        requestDate: new Date().toISOString().split("T")[0],
      };
      ctx.setHiringRequests(prev => [newRequest, ...prev]);
      closeModal();
    } catch (error) {
      window.alert(error.message || "Could not create the hiring request.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={closeModal}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">Request New Hire</div>
          <button className="modal-close" onClick={closeModal}>×</button>
        </div>
        <div className="modal-body">
          <div className="form-group"><label className="form-label">Role title *</label><input className="form-input" value={form.title} onChange={e => set("title", e.target.value)} placeholder="e.g. Procurement Specialist" /></div>
          <div className="form-row">
            <div className="form-group"><label className="form-label">Department</label><select className="form-select" value={form.dept} onChange={e => set("dept", e.target.value)}>{DEPARTMENTS.map(d => <option key={d}>{d}</option>)}</select></div>
            <div className="form-group"><label className="form-label">Entity</label><select className="form-select" value={form.entity} onChange={e => set("entity", e.target.value)}>{ENTITIES.map(en => <option key={en}>{en}</option>)}</select></div>
          </div>
          <div className="form-group"><label className="form-label">Business reason *</label><textarea className="form-textarea" value={form.reason} onChange={e => set("reason", e.target.value)} placeholder="Why is this hire needed now?" /></div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={closeModal}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={saving}>{saving ? "Saving..." : "Submit Request"}</button>
        </div>
      </div>
    </div>
  );
}

function AddJobModal({ data, closeModal, ctx }) {
  const [form, setForm] = useState({ title: "", dept: DEPARTMENTS[0], entity: ENTITIES[0], positionType: "Manpower", level: JOB_FAMILIES[0], headcount: 1, status: "Open", description: "", salaryMin: "", salaryMax: "", approvedBy: ctx.roleConfig.fullName, approvalDate: new Date().toISOString().split("T")[0] });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const submit = async () => {
    if (!form.title) return;
    const salaryMin = ctx.canViewSalary ? (parseFloat(form.salaryMin) || 0) : 0;
    const salaryMax = ctx.canViewSalary ? (parseFloat(form.salaryMax) || 0) : 1;
    if (salaryMax <= salaryMin) {
      alert("Salary max must be higher than salary min.");
      return;
    }
    setSaving(true);
    try {
      await ctx.backendActions.createPosition({
        ...form,
        salaryMin,
        salaryMax,
      });
      await ctx.reloadData?.();
      closeModal();
      return;
    } catch (e) {
      alert(e.message);
      return;
    } finally {
      setSaving(false);
    }
    const newJob = { ...form, id: Date.now(), openDate: new Date().toISOString().split("T")[0], recruiter: "Islam Ahmed", hiringManager: ctx.roleConfig.fullName, headcount: parseInt(form.headcount), salaryMin: parseFloat(form.salaryMin) || 0, salaryMax: parseFloat(form.salaryMax) || 0 };
    ctx.setJobs(prev => [...prev, newJob]);
    closeModal();
  };

  return (
    <div className="modal-overlay" onClick={closeModal}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">New Job Requisition</div>
          <button className="modal-close" onClick={closeModal}>×</button>
        </div>
        <div className="modal-body">
          <div className="form-group"><label className="form-label">Job title *</label><input className="form-input" value={form.title} onChange={e => set("title", e.target.value)} placeholder="e.g. Senior Solar Engineer" /></div>
          <div className="form-row">
            <div className="form-group"><label className="form-label">Department</label><select className="form-select" value={form.dept} onChange={e => set("dept", e.target.value)}>{DEPARTMENTS.map(d => <option key={d}>{d}</option>)}</select></div>
            <div className="form-group"><label className="form-label">Entity</label><select className="form-select" value={form.entity} onChange={e => set("entity", e.target.value)}>{ENTITIES.map(en => <option key={en}>{en}</option>)}</select></div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Position type</label>
              <select className="form-select" value={form.positionType} onChange={e => set("positionType", e.target.value)}>
                {POSITION_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="form-group"><label className="form-label">Job family</label><select className="form-select" value={form.level} onChange={e => set("level", e.target.value)}>{JOB_FAMILIES.map(f => <option key={f}>{f}</option>)}</select></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label className="form-label">Headcount</label><input className="form-input" type="number" min="1" value={form.headcount} onChange={e => set("headcount", e.target.value)} /></div>
            <div className="form-group"><label className="form-label">Initial status</label><select className="form-select" value={form.status} onChange={e => set("status", e.target.value)}><option>Draft</option><option>Open</option></select></div>
          </div>
          {ctx.canViewSalary ? (
            <div className="form-row">
              <div className="form-group"><label className="form-label">Min salary (EGP)</label><input className="form-input" type="number" value={form.salaryMin} onChange={e => set("salaryMin", e.target.value)} placeholder="20000" /></div>
              <div className="form-group"><label className="form-label">Max salary (EGP)</label><input className="form-input" type="number" value={form.salaryMax} onChange={e => set("salaryMax", e.target.value)} placeholder="35000" /></div>
            </div>
          ) : (
            <div className="alert alert-info" style={{ marginBottom: 16 }}><Icon name="alert" size={14} />Salary fields are restricted for this user.</div>
          )}
          <div className="form-row">
            <div className="form-group"><label className="form-label">Approved by</label><input className="form-input" value={form.approvedBy} onChange={e => set("approvedBy", e.target.value)} placeholder="Approver name" /></div>
            <div className="form-group"><label className="form-label">Approval date</label><input className="form-input" type="date" value={form.approvalDate} onChange={e => set("approvalDate", e.target.value)} /></div>
          </div>
          <div className="form-group"><label className="form-label">Description</label><textarea className="form-textarea" value={form.description} onChange={e => set("description", e.target.value)} placeholder="Role summary and requirements..." /></div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={closeModal}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={saving}>{saving ? "Creating..." : "Create Requisition"}</button>
        </div>
      </div>
    </div>
  );
}

function AddCandidateModal({ data, closeModal, ctx }) {
  const [form, setForm] = useState({ name: "", email: "", phone: "", nationality: "Egyptian", source: SOURCES[0], referredBy: "", jobId: ctx.jobs.find(j => j.status === "Open")?.id || "" });
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const colors = ["#4f8ef7","#2dd4b4","#a78bfa","#f59e0b","#fb923c","#f87171","#4ade80"];

  const submit = async () => {
    if (!form.name.trim()) return;
    if (form.source === "Referral" && !form.referredBy.trim()) return;
    const names = splitName(form.name);
    try {
      const created = await ctx.backendActions.createCandidate({
        firstName: names.firstName,
        lastName: names.lastName,
        email: form.email.trim(),
        phone: form.phone,
        nationality: form.nationality,
        source: form.source === "Referral" ? "referral" : form.source.toLowerCase().replace(/\s+/g, "_"),
        tags: form.referredBy ? [`Referral: ${form.referredBy.trim()}`] : [],
      });
      if (form.jobId) {
        await ctx.backendActions.createApplication({ candidateId: created.id, positionId: form.jobId });
      }
      await ctx.reloadData?.();
      closeModal();
      return;
    } catch (e) {
      alert(e.message);
      return;
    }
    const color = colors[Math.floor(Math.random() * colors.length)];
    const newCand = {
      ...form,
      referredBy: form.source === "Referral" ? form.referredBy.trim() : "",
      id: Date.now(),
      cvUrl: "#",
      addedDate: new Date().toISOString().split("T")[0],
      tags: [],
      color,
    };
    ctx.setCandidates(prev => [...prev, newCand]);
    if (form.jobId) {
      const newApp = { id: Date.now() + 1, candidateId: newCand.id, jobId: form.jobId, stage: "Applied", status: "Active", recruiter: "Islam Ahmed", appliedDate: new Date().toISOString().split("T")[0], notes: "", daysInStage: 0, priority: "", nextAction: "Review CV", lastActivityAt: todayISO() };
      ctx.setApplications(prev => [...prev, newApp]);
    }
    closeModal();
  };

  return (
    <div className="modal-overlay" onClick={closeModal}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">Add Candidate</div>
          <button className="modal-close" onClick={closeModal}>×</button>
        </div>
        <div className="modal-body">
          <div className="form-group"><label className="form-label">Full name *</label><input data-testid="candidate-name-input" className="form-input" value={form.name} onChange={e => set("name", e.target.value)} placeholder="e.g. Ahmed Kamel" /></div>
          <div className="form-row">
            <div className="form-group"><label className="form-label">Email</label><input data-testid="candidate-email-input" className="form-input" type="email" value={form.email} onChange={e => set("email", e.target.value)} placeholder="Optional" /></div>
            <div className="form-group"><label className="form-label">Phone</label><input className="form-input" value={form.phone} onChange={e => set("phone", e.target.value)} placeholder="+20 1xx xxx xxxx" /></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label className="form-label">Nationality</label><input className="form-input" value={form.nationality} onChange={e => set("nationality", e.target.value)} /></div>
            <div className="form-group"><label className="form-label">Source</label><select data-testid="candidate-source-select" className="form-select" value={form.source} onChange={e => set("source", e.target.value)}>{SOURCES.map(s => <option key={s}>{s}</option>)}</select></div>
          </div>
          {form.source === "Referral" && (
            <div className="form-group">
              <label className="form-label">Referred by *</label>
              <input
                className="form-input"
                value={form.referredBy}
                onChange={e => set("referredBy", e.target.value)}
                placeholder="Employee or referrer name"
              />
              {!form.referredBy.trim() && <div style={{ fontSize: 11, color: "var(--red)", marginTop: 6 }}>Referral source is required.</div>}
            </div>
          )}
          <div className="form-group"><label className="form-label">Apply to job (optional)</label>
            <select data-testid="candidate-job-select" className="form-select" value={form.jobId} onChange={e => set("jobId", e.target.value)}>
              <option value="">— No job yet —</option>
              {ctx.jobs.filter(j => j.status === "Open").map(j => <option key={j.id} value={j.id}>{j.title} ({j.entity})</option>)}
            </select>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={closeModal}>Cancel</button>
          <button data-testid="submit-add-candidate" className="btn btn-primary" onClick={submit} disabled={form.source === "Referral" && !form.referredBy.trim()} style={{ opacity: form.source === "Referral" && !form.referredBy.trim() ? 0.5 : 1 }}>Add Candidate</button>
        </div>
      </div>
    </div>
  );
}

function ViewCandidateModal({ data, closeModal, ctx }) {
  const { candidate: c, activeApp, activeJob } = data;
  const allApps = ctx.applications.filter(a => a.candidateId === c.id);
  const candidateAppIds = allApps.map(a => a.id);
  const candidateInterviews = ctx.interviews.filter(i => candidateAppIds.includes(i.applicationId));
  const candidateScorecards = ctx.scorecards.filter(s => candidateAppIds.includes(s.applicationId));
  const candidateOffers = ctx.offers.filter(o => candidateAppIds.includes(o.applicationId));
  const stageIdx = activeApp ? stageIndex(activeApp.stage) : -1;
  const [movingStage, setMovingStage] = useState(false);
  const [movingJob, setMovingJob] = useState(false);
  const [selectedStage, setSelectedStage] = useState(activeApp?.stage || "Applied");
  const [selectedJobId, setSelectedJobId] = useState(activeApp?.jobId || "");
  const [moveNotes, setMoveNotes] = useState(activeApp?.notes || "");
  const [newNote, setNewNote] = useState("");
  const [notesLog, setNotesLog] = useState(c.notesLog || []);
  const [showCvPreview, setShowCvPreview] = useState(false);
  const [editingCandidate, setEditingCandidate] = useState(false);
  const [savingCandidate, setSavingCandidate] = useState(false);
  const [candidateForm, setCandidateForm] = useState({
    name: c.name || "",
    title: c.title || "",
    email: isGeneratedCandidateEmail(c.email) ? "" : c.email || "",
    phone: c.phone || "",
    nationality: c.nationality || "",
    source: normalizeCandidateSource(c.source),
  });
  const cvUrl = c.cvUrl && c.cvUrl !== "#" ? c.cvUrl : "";
  const [cvPreviewUrl, setCvPreviewUrl] = useState("");
  const [cvPreviewLoading, setCvPreviewLoading] = useState(false);
  const [cvPreviewError, setCvPreviewError] = useState("");
  const latestScore = candidateScorecards[0];
  const latestRating = candidateScorecards.length ? (candidateScorecards.reduce((sum, s) => sum + ((s.knowledge + s.attitude + s.feedback) / 3), 0) / candidateScorecards.length).toFixed(1) : "—";
  const canMoveCandidate = !!ctx.roleConfig.canMoveCandidates;
  const canScheduleInterview = !!ctx.roleConfig.canScheduleInterviews;
  const canCreateOffer = !!ctx.roleConfig.canCreateOffers;
  const canEditCandidate = !!ctx.roleConfig.canEditCandidates;

  const requisitionOptions = [...ctx.jobs].sort((a, b) => {
    const currentA = String(a.id) === String(activeApp?.jobId) ? -1 : 0;
    const currentB = String(b.id) === String(activeApp?.jobId) ? -1 : 0;
    if (currentA !== currentB) return currentA - currentB;
    return `${a.title} ${a.dept}`.localeCompare(`${b.title} ${b.dept}`);
  });

  useEffect(() => {
    if (!showCvPreview || !cvUrl) return undefined;
    let alive = true;
    let objectUrl = "";
    setCvPreviewLoading(true);
    setCvPreviewError("");
    fetchFileBlob(cvUrl)
      .then(blob => {
        if (!alive) return;
        objectUrl = URL.createObjectURL(blob);
        setCvPreviewUrl(objectUrl);
      })
      .catch(error => {
        if (!alive) return;
        setCvPreviewUrl("");
        setCvPreviewError(error.message || "CV file could not be loaded.");
      })
      .finally(() => {
        if (alive) setCvPreviewLoading(false);
      });
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setCvPreviewUrl("");
    };
  }, [showCvPreview, cvUrl]);

  const saveStage = async () => {
    if (!canMoveCandidate) return;
    try {
      if (selectedStage === "Rejected") {
        await ctx.backendActions.rejectApplication(activeApp.id, { reason: moveNotes.trim() || "Rejected from candidate profile" });
      } else {
        await ctx.backendActions.moveApplication(activeApp.id, { stage: STAGE_TO_BACKEND[selectedStage] || "applied", displayStage: selectedStage, reason: moveNotes });
      }
      await ctx.reloadData?.();
      setMovingStage(false);
      closeModal();
      return;
    } catch (e) {
      alert(e.message);
      return;
    }
    ctx.setApplications(prev => prev.map(a => a.id === activeApp.id ? { ...a, stage: selectedStage, notes: moveNotes, daysInStage: 0, lastActivityAt: todayISO() } : a));
    setMovingStage(false);
    closeModal();
  };

  const saveJob = async () => {
    if (!canMoveCandidate) return;
    if (!selectedJobId) return;
    if (activeApp?.id && ctx.backendActions?.transferApplication) {
      try {
        await ctx.backendActions.transferApplication(activeApp.id, { positionId: selectedJobId });
        await ctx.reloadData?.();
        setMovingJob(false);
        closeModal();
        return;
      } catch (e) {
        alert(e.message || "Could not change this candidate's requisition.");
        return;
      }
    }
    ctx.setApplications(prev => prev.map(a => a.id === activeApp.id ? { ...a, jobId: selectedJobId, stage: "Applied", daysInStage: 0, nextAction: "Review CV", lastActivityAt: todayISO() } : a));
    setMovingJob(false);
    closeModal();
  };

  const addNote = async () => {
    if (!newNote.trim()) return;
    if (activeApp?.id) {
      try {
        await ctx.backendActions.addNote(activeApp.id, { content: newNote.trim(), isInternal: true });
        await ctx.reloadData?.();
      } catch (e) {
        alert(e.message);
        return;
      }
    }
    const entry = {
      id: Date.now(),
      owner: ctx.roleConfig.fullName,
      date: new Date().toISOString().split("T")[0],
      text: newNote.trim(),
    };
    ctx.setCandidates(prev => prev.map(candidate => candidate.id === c.id ? { ...candidate, notesLog: [entry, ...(candidate.notesLog || [])] } : candidate));
    setNotesLog(prev => [entry, ...prev]);
    setNewNote("");
  };

  const saveCandidateDetails = async () => {
    if (!canEditCandidate || !candidateForm.name.trim()) return;
    setSavingCandidate(true);
    try {
      const { firstName, lastName } = splitName(candidateForm.name);
      await ctx.backendActions.updateCandidate(c.id, {
        firstName,
        lastName,
        email: candidateForm.email.trim(),
        phone: candidateForm.phone.trim(),
        nationality: candidateForm.nationality.trim(),
        currentTitle: candidateForm.title.trim(),
        source: candidateForm.source,
      });
      ctx.setCandidates(prev => prev.map(candidate => candidate.id === c.id ? {
        ...candidate,
        name: candidateForm.name.trim(),
        title: candidateForm.title.trim(),
        email: candidateForm.email.trim(),
        phone: candidateForm.phone.trim(),
        nationality: candidateForm.nationality.trim(),
        source: candidateForm.source,
      } : candidate));
      await ctx.reloadData?.();
      setEditingCandidate(false);
    } catch (e) {
      alert(e.message || "Could not save candidate details.");
    } finally {
      setSavingCandidate(false);
    }
  };

  const cancelCandidateEdit = () => {
    setCandidateForm({
      name: c.name || "",
      title: c.title || "",
      email: isGeneratedCandidateEmail(c.email) ? "" : c.email || "",
      phone: c.phone || "",
      nationality: c.nationality || "",
      source: normalizeCandidateSource(c.source),
    });
    setEditingCandidate(false);
  };

  const rejectCandidate = async () => {
    if (!canMoveCandidate) return;
    if (!activeApp) return;
    try {
      await ctx.backendActions.rejectApplication(activeApp.id, { reason: "Rejected from candidate profile" });
      await ctx.reloadData?.();
      closeModal();
    } catch (e) {
      alert(e.message || "Could not reject this application.");
    }
  };

  const moveToNextStage = async () => {
    if (!canMoveCandidate) return;
    if (!activeApp) return;
    const idx = STAGES.indexOf(activeApp.stage);
    const nextStage = STAGES[Math.min(idx + 1, PIPELINE_STAGES.length - 1)] || activeApp.stage;
    try {
      await ctx.backendActions.moveApplication(activeApp.id, { stage: STAGE_TO_BACKEND[nextStage] || "applied", displayStage: nextStage, reason: "Moved from candidate profile" });
      await ctx.reloadData?.();
      closeModal();
    } catch (e) {
      alert(e.message || "Could not move this application.");
    }
  };

  const createOfferForCandidate = () => {
    if (!canCreateOffer) return;
    if (!activeApp) return;
    ctx.openModal("addOffer", { applicationId: activeApp.id });
  };

  const downloadCv = async () => {
    if (!cvUrl) return;
    try {
      const blob = await fetchFileBlob(cvUrl);
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = c.cvFileName || `${c.name.replace(/\s+/g, "_")}_CV.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      alert(error.message || "CV file could not be downloaded.");
    }
  };

  return (
    <div className="modal-overlay" onClick={closeModal}>
      <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: "50%", background: c.color + "22", color: c.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700 }}>{initials(c.name)}</div>
            <div>
              <div className="modal-title">{c.name}</div>
              <div style={{ fontSize: 12, color: "var(--text3)", fontFamily: "var(--mono)" }}>
                {c.source}{c.source === "Referral" && c.referredBy ? ` from ${c.referredBy}` : ""} · Added {c.addedDate}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {canEditCandidate && (
              <button className="btn btn-ghost btn-sm" onClick={() => editingCandidate ? cancelCandidateEdit() : setEditingCandidate(true)}>
                <Icon name="edit" size={13} /> {editingCandidate ? "Cancel edit" : "Edit"}
              </button>
            )}
            <button className="modal-close" onClick={closeModal}>×</button>
          </div>
        </div>
        <div className="modal-body">
          <div className="form-row" style={{ marginBottom: 20 }}>
            <div>
              <div className="form-label">Contact</div>
              {editingCandidate ? (
                <div style={{ display: "grid", gap: 8 }}>
                  <input className="form-input" type="email" value={candidateForm.email} onChange={e => setCandidateForm(p => ({ ...p, email: e.target.value }))} placeholder="Email" />
                  <input className="form-input" value={candidateForm.phone} onChange={e => setCandidateForm(p => ({ ...p, phone: e.target.value }))} placeholder="Phone" />
                </div>
              ) : (
                <>
                  <div style={{ fontSize: 13, color: "var(--text2)", marginBottom: 4 }}>{candidateEmailDisplay(c.email)}</div>
                  <div style={{ fontSize: 13, color: "var(--text2)" }}>{c.phone || "—"}</div>
                </>
              )}
            </div>
            <div>
              <div className="form-label">Nationality</div>
              {editingCandidate ? (
                <div style={{ display: "grid", gap: 8 }}>
                  <input className="form-input" value={candidateForm.nationality} onChange={e => setCandidateForm(p => ({ ...p, nationality: e.target.value }))} placeholder="Nationality" />
                  <select className="form-select" value={candidateForm.source} onChange={e => setCandidateForm(p => ({ ...p, source: e.target.value }))}>
                    {SOURCES.map(source => <option key={source} value={source}>{source}</option>)}
                  </select>
                </div>
              ) : (
                <div style={{ fontSize: 13, color: "var(--text2)" }}>{c.nationality}</div>
              )}
              {!editingCandidate && c.source === "Referral" && (
                <>
                  <div className="form-label" style={{ marginTop: 10 }}>Referred by</div>
                  <div style={{ fontSize: 13, color: "var(--text2)" }}>{c.referredBy || "—"}</div>
                </>
              )}
            </div>
          </div>
          {editingCandidate && (
            <>
              <div className="form-row" style={{ marginBottom: 16 }}>
                <div className="form-group">
                  <label className="form-label">Candidate name</label>
                  <input className="form-input" value={candidateForm.name} onChange={e => setCandidateForm(p => ({ ...p, name: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Title</label>
                  <input className="form-input" value={candidateForm.title} onChange={e => setCandidateForm(p => ({ ...p, title: e.target.value }))} placeholder="Current or target title" />
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 18 }}>
                <button className="btn btn-ghost btn-sm" onClick={cancelCandidateEdit} disabled={savingCandidate}>Cancel</button>
                <button className="btn btn-primary btn-sm" onClick={saveCandidateDetails} disabled={savingCandidate || !candidateForm.name.trim()}>
                  {savingCandidate ? "Saving..." : "Save changes"}
                </button>
              </div>
            </>
          )}

          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
            {activeApp && canMoveCandidate && <button className="btn btn-primary btn-sm" onClick={moveToNextStage}>Move to next stage</button>}
            {activeApp && canScheduleInterview && <button className="btn btn-ghost btn-sm" onClick={() => ctx.openModal("scheduleInterview", { applicationId: activeApp.id })}>Schedule interview</button>}
            {activeApp && canCreateOffer && <button className="btn btn-ghost btn-sm" onClick={createOfferForCandidate}>Create offer</button>}
            {c.email && !isGeneratedCandidateEmail(c.email) && <a className="btn btn-ghost btn-sm" href={`mailto:${c.email}?subject=Karm ATS follow-up`} style={{ textDecoration: "none" }}>Send email</a>}
            {activeApp && canMoveCandidate && <button className="btn btn-danger btn-sm" onClick={rejectCandidate}>Reject application</button>}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 16, marginBottom: 20 }}>
            <div style={{ background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 14 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
                <div className="form-label" style={{ margin: 0 }}>CV Viewer</div>
                <div style={{ display: "flex", gap: 8 }}>
                  {cvUrl ? (
                    <>
                      <button className="btn btn-ghost btn-sm" onClick={() => setShowCvPreview(v => !v)}>{showCvPreview ? "Hide CV" : "View CV"}</button>
                      <button className="btn btn-ghost btn-sm" onClick={downloadCv}>Download CV</button>
                    </>
                  ) : (
                    <span className="badge badge-gray">No CV attached</span>
                  )}
                </div>
              </div>
              {showCvPreview && cvUrl ? (
                cvPreviewLoading ? (
                  <div className="empty-panel" style={{ minHeight: 180, display: "flex", alignItems: "center", justifyContent: "center" }}>Loading CV...</div>
                ) : cvPreviewError ? (
                  <div className="alert alert-amber" style={{ minHeight: 120 }}>
                    <Icon name="alert" size={14} />
                    {cvPreviewError}
                  </div>
                ) : cvPreviewUrl ? (
                  <object data={cvPreviewUrl} type="application/pdf" style={{ width: "100%", height: 260, border: "1px solid var(--border)", borderRadius: "var(--radius)", background: "white" }}>
                    <iframe title={`${c.name} CV`} src={cvPreviewUrl} style={{ width: "100%", height: 260, border: 0 }} />
                  </object>
                ) : null
              ) : (
                <div style={{ minHeight: 180, border: "1px dashed var(--border2)", borderRadius: "var(--radius)", display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", color: "var(--text3)", fontSize: 12, padding: 16 }}>
                  {cvUrl ? "CV is attached. Click View CV to preview it, or Download CV to save it." : "No CV has been uploaded for this candidate yet."}
                </div>
              )}
              <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 8, fontFamily: "var(--mono)" }}>{c.cvFileName || (cvUrl ? "CV attached" : "No CV file")}</div>
            </div>
            <div style={{ background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 14 }}>
              <div className="form-label">Decision Summary</div>
              <div style={{ display: "grid", gap: 8 }}>
                <span className={`badge ${activeApp ? stageBadge(activeApp.stage) : "badge-gray"}`}>{activeApp?.stage || "No active application"}</span>
                <span style={{ fontSize: 12, color: "var(--text2)" }}>Overall rating: {latestRating}/5</span>
                <span style={{ fontSize: 12, color: "var(--text2)" }}>Latest recommendation: {latestScore?.recommendation || "—"}</span>
                {latestScore && <span style={{ fontSize: 11, color: "var(--text3)" }}>Knowledge {latestScore.knowledge}/5 · Attitude {latestScore.attitude}/5 · Feedback {latestScore.feedback}/5</span>}
              </div>
            </div>
          </div>

          {activeApp && (
            <>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <div className="form-label" style={{ margin: 0 }}>Current application stage</div>
                <div style={{ display: "flex", gap: 8 }}>
                  {canMoveCandidate && <button className="btn btn-ghost btn-sm" onClick={() => { setMovingJob(!movingJob); setMovingStage(false); }}>
                    🔀 Change requisition
                  </button>}
                  {canMoveCandidate && <button className="btn btn-ghost btn-sm" onClick={() => { setMovingStage(!movingStage); setMovingJob(false); }}>
                    ↕ Move stage
                  </button>}
                </div>
              </div>
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", gap: 3, marginBottom: 8 }}>
                  {PIPELINE_STAGES.map((s, i) => (
                    <div key={s} style={{ flex: 1, height: 5, borderRadius: 3, background: i < stageIdx ? "var(--accent)" : i === stageIdx ? stageColor(activeApp.stage) : "var(--bg4)" }} title={s} />
                  ))}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className={`badge ${stageBadge(activeApp.stage)}`}>{activeApp.stage}</span>
                  <span style={{ fontSize: 11, color: "var(--text3)" }}>on {activeJob?.title} · {activeJob?.dept}</span>
                </div>
              </div>

              {/* MOVE STAGE PANEL */}
              {movingStage && (
                <div style={{ background: "var(--bg3)", borderRadius: "var(--radius)", padding: "16px", marginBottom: 16, border: "1px solid var(--border2)" }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", marginBottom: 12 }}>Move to stage</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 12 }}>
                    {STAGES.map(stage => (
                      <div key={stage} onClick={() => setSelectedStage(stage)} style={{ padding: "8px 10px", borderRadius: "var(--radius)", border: `1px solid ${selectedStage === stage ? stageColor(stage) : "var(--border)"}`, background: selectedStage === stage ? stageColor(stage) + "18" : "transparent", cursor: "pointer", display: "flex", alignItems: "center", gap: 7 }}>
                        <div style={{ width: 7, height: 7, borderRadius: "50%", background: stageColor(stage), flexShrink: 0 }} />
                        <span style={{ fontSize: 11, color: selectedStage === stage ? "var(--text)" : "var(--text2)", fontWeight: selectedStage === stage ? 500 : 400 }}>{stage}</span>
                      </div>
                    ))}
                  </div>
                  <div className="form-group" style={{ marginBottom: 10 }}>
                    <label className="form-label">Notes</label>
                    <textarea className="form-textarea" style={{ minHeight: 60 }} value={moveNotes} onChange={e => setMoveNotes(e.target.value)} placeholder="Reason for stage change..." />
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => setMovingStage(false)}>Cancel</button>
                    <button className="btn btn-primary btn-sm" onClick={saveStage}>Confirm move</button>
                  </div>
                </div>
              )}

              {/* CHANGE JOB PANEL */}
              {movingJob && (
                <div style={{ background: "var(--bg3)", borderRadius: "var(--radius)", padding: "16px", marginBottom: 16, border: "1px solid var(--border2)" }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", marginBottom: 12 }}>Move application to a different requisition</div>
                  <div className="alert alert-amber" style={{ marginBottom: 12, fontSize: 12 }}>
                    <Icon name="alert" size={13} /> This application will move to the Applied stage of the selected requisition.
                  </div>
                  <div className="form-group" style={{ marginBottom: 10 }}>
                    <label className="form-label">Select requisition</label>
                    <select className="form-select" value={selectedJobId} onChange={e => setSelectedJobId(e.target.value)}>
                      <option value="">— Select a requisition —</option>
                      {requisitionOptions.map(j => (
                        <option key={j.id} value={j.id}>{j.title} · {j.dept} · {j.entity} · {j.status}</option>
                      ))}
                    </select>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => setMovingJob(false)}>Cancel</button>
                    <button className="btn btn-primary btn-sm" onClick={saveJob} disabled={!selectedJobId}>Confirm transfer</button>
                  </div>
                </div>
              )}

              {activeApp.notes && !movingStage && !movingJob && (
                <div style={{ background: "var(--bg3)", borderRadius: "var(--radius)", padding: "12px 14px", fontSize: 13, color: "var(--text2)", marginBottom: 16 }}>
                  <div className="form-label" style={{ marginBottom: 4 }}>HR notes</div>
                  {activeApp.notes}
                </div>
              )}
            </>
          )}

          <div className="card" style={{ marginBottom: 18 }}>
            <div className="card-header">
              <div className="card-title">Notes & collaboration</div>
              <span className="badge badge-blue">{notesLog.length} notes</span>
            </div>
            <div className="card-body">
              <div className="form-group">
                <label className="form-label">Add note</label>
                <textarea className="form-textarea" value={newNote} onChange={e => setNewNote(e.target.value)} placeholder="Add HR, hiring manager, or interviewer context..." />
              </div>
              <button className="btn btn-primary btn-sm" onClick={addNote}>Add Note</button>
              <div className="divider" />
              {notesLog.length === 0 ? (
                <div style={{ color: "var(--text3)", fontSize: 13 }}>No collaboration notes yet.</div>
              ) : notesLog.map(note => (
                <div key={note.id} style={{ padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
                  <div style={{ fontSize: 12, color: "var(--text)", fontWeight: 600 }}>{note.owner} <span style={{ color: "var(--text3)", fontWeight: 400 }}>– {formatDisplayDate(note.date)}</span></div>
                  <div style={{ fontSize: 13, color: "var(--text2)", marginTop: 4, lineHeight: 1.6 }}>{note.text}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="form-row" style={{ marginBottom: 18 }}>
            <div style={{ background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 14 }}>
              <div className="form-label">HM Notes</div>
              <div style={{ fontSize: 13, color: "var(--text2)", lineHeight: 1.6 }}>
                {activeJob ? `${activeJob.hiringManager}: Review against ${activeJob.title} requirements before final decision.` : "No hiring manager notes yet."}
              </div>
            </div>
            <div style={{ background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 14 }}>
              <div className="form-label">Interview Feedback</div>
              {candidateScorecards.length === 0 ? (
                <div style={{ fontSize: 13, color: "var(--text3)" }}>No scorecards submitted yet.</div>
              ) : candidateScorecards.map(sc => (
                <div key={sc.id} style={{ fontSize: 12, color: "var(--text2)", marginBottom: 10, lineHeight: 1.5 }}>
                  <strong style={{ color: "var(--text)" }}>{sc.interviewType}</strong> · {sc.recommendation} · {((sc.knowledge + sc.attitude + sc.feedback) / 3).toFixed(1)}/5<br />
                  Knowledge {sc.knowledge}/5 · Attitude {sc.attitude}/5 · Feedback {sc.feedback}/5<br />
                  {sc.notes}
                </div>
              ))}
            </div>
          </div>

          <div className="form-label">Application history</div>
          {allApps.length === 0 ? (
            <div style={{ color: "var(--text3)", fontSize: 13 }}>No applications yet.</div>
          ) : allApps.map(app => {
            const job = ctx.jobs.find(j => j.id === app.jobId);
            return (
              <div key={app.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text)" }}>{job?.title}</div>
                  <div style={{ fontSize: 11, color: "var(--text3)", fontFamily: "var(--mono)" }}>{app.appliedDate}</div>
                </div>
                <span className={`badge ${stageBadge(app.stage)}`}>{app.stage}</span>
              </div>
            );
          })}

          <div className="form-label" style={{ marginTop: 18 }}>Timeline</div>
          {[...allApps.flatMap(app => ([
              { at: app.appliedDate, title: "Applied", owner: app.recruiter || "Recruiter", text: ctx.jobs.find(j => j.id === app.jobId)?.title || "Role" },
              { at: app.appliedDate, title: `Moved to ${app.stage}`, owner: app.recruiter || "Recruiter", text: `${app.daysInStage} day${app.daysInStage === 1 ? "" : "s"} in stage` },
            ])),
            ...candidateInterviews.map(i => ({ at: i.scheduledAt, title: "Interview scheduled", owner: i.interviewerId, text: i.type })),
            ...candidateScorecards.map(s => ({ at: s.submittedDate, title: "Scorecard submitted", owner: s.interviewerId, text: `${s.recommendation} · ${((s.knowledge + s.attitude + s.feedback) / 3).toFixed(1)}/5` })),
            ...candidateOffers.map(o => ({ at: o.createdDate, title: "Offer created", owner: o.createdBy, text: ctx.canViewSalary ? `${o.status} · ${o.salary.toLocaleString()} ${o.currency}` : `${o.status} · salary restricted` })),
          ].map((item, i) => (
            <div key={i} style={{ display: "flex", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
              <span className="dot dot-blue" style={{ marginTop: 6 }} />
              <div>
                <div style={{ fontSize: 13, color: "var(--text)" }}>{item.title} <span style={{ color: "var(--text3)" }}>– by {item.owner || "—"}</span></div>
                <div style={{ fontSize: 12, color: "var(--text2)" }}>{item.text}</div>
                <div style={{ fontSize: 11, color: "var(--text3)", fontFamily: "var(--mono)" }}>{formatDisplayDate(item.at)}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={closeModal}>Close</button>
        </div>
      </div>
    </div>
  );
}

function MoveStageModal({ data, closeModal, ctx }) {
  const { app, cand, job } = data;
  const [selectedStage, setSelectedStage] = useState(data.targetStage || app.stage);
  const [notes, setNotes] = useState(app.notes || "");
  const [nextAction, setNextAction] = useState(app.nextAction || "");

  const requiresReason = selectedStage === "Rejected" || isBackwardMove(app.stage, selectedStage);

  const save = async () => {
    if (requiresReason && !notes.trim()) return;
    try {
      if (selectedStage === "Rejected") {
        await ctx.backendActions.rejectApplication(app.id, { reason: notes.trim() });
      } else {
        await ctx.backendActions.moveApplication(app.id, { stage: STAGE_TO_BACKEND[selectedStage] || "applied", displayStage: selectedStage, reason: notes });
      }
      await ctx.reloadData?.();
      closeModal();
      return;
    } catch (e) {
      alert(e.message);
      return;
    }
    ctx.setApplications(prev => prev.map(a => a.id === app.id ? {
      ...a,
      stage: selectedStage,
      status: selectedStage === "Rejected" ? "Rejected" : "Active",
      notes,
      nextAction,
      daysInStage: 0,
      lastActivityAt: todayISO(),
    } : a));
    closeModal();
  };

  return (
    <div className="modal-overlay" onClick={closeModal}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">Move application</div>
          <button className="modal-close" onClick={closeModal}>×</button>
        </div>
        <div className="modal-body">
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20, padding: "12px 14px", background: "var(--bg3)", borderRadius: "var(--radius)", border: "1px solid var(--border)" }}>
            <div style={{ width: 34, height: 34, borderRadius: "50%", background: cand.color + "22", color: cand.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700 }}>{initials(cand.name)}</div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>{cand.name}</div>
              <div style={{ fontSize: 11, color: "var(--text3)" }}>{job?.title}</div>
            </div>
            <span className={`badge ${stageBadge(app.stage)}`} style={{ marginLeft: "auto" }}>{app.stage}</span>
          </div>

          <div className="form-group">
            <label className="form-label">Move to stage</label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {STAGES.map(stage => (
                <div key={stage} onClick={() => setSelectedStage(stage)} style={{ padding: "9px 12px", borderRadius: "var(--radius)", border: `1px solid ${selectedStage === stage ? stageColor(stage) : "var(--border)"}`, background: selectedStage === stage ? stageColor(stage) + "18" : "var(--bg3)", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, transition: "all 0.1s" }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: stageColor(stage), flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: selectedStage === stage ? "var(--text)" : "var(--text2)", fontWeight: selectedStage === stage ? 500 : 400 }}>{stage}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Reason / notes {requiresReason ? "*" : ""}</label>
            <textarea className="form-textarea" value={notes} onChange={e => setNotes(e.target.value)} placeholder={requiresReason ? "Required for rejected or backward movement..." : "Add context for this stage move..."} />
            {requiresReason && !notes.trim() && <div style={{ fontSize: 11, color: "var(--red)", marginTop: 6 }}>Reason is required for this movement.</div>}
          </div>
          <div className="form-group">
            <label className="form-label">Next action</label>
            <input className="form-input" value={nextAction} onChange={e => setNextAction(e.target.value)} placeholder="e.g. Schedule technical interview" />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={closeModal}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={requiresReason && !notes.trim()} style={{ opacity: requiresReason && !notes.trim() ? 0.5 : 1 }}>Save & Move</button>
        </div>
      </div>
    </div>
  );
}

function ScorecardModal({ data, closeModal, ctx }) {
  const { interview, app, cand, job, existingScore } = data;
  const [scores, setScores] = useState({ knowledge: existingScore?.knowledge || 0, attitude: existingScore?.attitude || 0, feedback: existingScore?.feedback || 0 });
  const [recommendation, setRecommendation] = useState(existingScore?.recommendation || "");
  const [notes, setNotes] = useState(existingScore?.notes || "");
  const [saving, setSaving] = useState(false);
  const readOnly = !!existingScore;

  const avg = scores.knowledge && scores.attitude && scores.feedback
    ? ((scores.knowledge + scores.attitude + scores.feedback) / 3).toFixed(1)
    : "—";

  const StarRow = ({ label, field }) => (
    <div className="score-row">
      <span className="score-label">{label}</span>
      <div className="score-stars">
        {[1, 2, 3, 4, 5].map(n => (
          <div key={n} className={`score-star ${scores[field] >= n ? "active" : ""}`}
            onClick={() => !readOnly && setScores(p => ({ ...p, [field]: n }))}>
            {n}
          </div>
        ))}
      </div>
    </div>
  );

  const submit = async () => {
    if (!recommendation || !scores.knowledge || !scores.attitude || !scores.feedback || saving) return;
    setSaving(true);
    const newSc = { id: Date.now(), applicationId: app.id, interviewerId: ctx.roleConfig.fullName, interviewType: interview.type, knowledge: scores.knowledge, attitude: scores.attitude, feedback: scores.feedback, recommendation, notes, submittedDate: new Date().toISOString().split("T")[0] };
    try {
      if (ctx.backendActions?.submitInterviewScore) {
        await ctx.backendActions.submitInterviewScore(interview.id, { scores, recommendation, notes });
      }
      ctx.setScorecards(prev => [...prev.filter(s => s.applicationId !== app.id), newSc]);
      ctx.setInterviews(prev => prev.map(i => String(i.id) === String(interview.id) ? { ...i, status: "Completed" } : i));
      await ctx.reloadData?.();
      closeModal();
    } catch (e) {
      alert(e.message || "Could not save this scorecard.");
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={closeModal}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="modal-title">Interview Scorecard</div>
            <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 2 }}>{cand?.name} · {interview?.type}</div>
          </div>
          <button className="modal-close" onClick={closeModal}>×</button>
        </div>
        <div className="modal-body">
          {readOnly && <div className="alert alert-info" style={{ marginBottom: 16 }}><Icon name="alert" size={14} />Scorecard submitted on {existingScore.submittedDate}</div>}
          <StarRow label="Knowledge" field="knowledge" />
          <StarRow label="Attitude" field="attitude" />
          <StarRow label="Feedback" field="feedback" />

          <div className="divider" />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <span style={{ fontSize: 13, color: "var(--text2)" }}>Average score</span>
            <span style={{ fontSize: 22, fontWeight: 600, color: "var(--accent)", fontFamily: "var(--mono)" }}>{avg}<span style={{ fontSize: 13, color: "var(--text3)" }}>/5</span></span>
          </div>

          <div className="form-group">
            <label className="form-label">Recommendation</label>
            <div style={{ display: "flex", gap: 8 }}>
              {["Strong Hire", "Hire", "No Hire"].map(r => (
                <div key={r} onClick={() => !readOnly && setRecommendation(r)} style={{ flex: 1, padding: "9px", textAlign: "center", borderRadius: "var(--radius)", border: `1px solid ${recommendation === r ? (r.includes("Hire") && r !== "No Hire" ? "var(--green)" : "var(--red)") : "var(--border)"}`, background: recommendation === r ? (r.includes("Hire") && r !== "No Hire" ? "var(--green-soft)" : "var(--red-soft)") : "var(--bg3)", cursor: readOnly ? "default" : "pointer", fontSize: 13, fontWeight: recommendation === r ? 600 : 400, color: recommendation === r ? (r.includes("Hire") && r !== "No Hire" ? "var(--green)" : "var(--red)") : "var(--text2)", transition: "all 0.1s" }}>
                  {r}
                </div>
              ))}
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Notes {readOnly ? "" : "(visible to Admin only)"}</label>
            <textarea className="form-textarea" value={notes} onChange={e => setNotes(e.target.value)} readOnly={readOnly} placeholder="Strengths, concerns, overall impression..." />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={closeModal}>{readOnly ? "Close" : "Cancel"}</button>
          {!readOnly && <button className="btn btn-primary" onClick={submit} disabled={!recommendation || !scores.knowledge || !scores.attitude || !scores.feedback || saving}>{saving ? "Saving..." : "Submit Scorecard"}</button>}
        </div>
      </div>
    </div>
  );
}

function AddOfferModal({ data, closeModal, ctx }) {
  const activeApps = ctx.applications.filter(a => a.status === "Active" && (["Final Interview", "Offer"].includes(a.stage) || a.id === data?.applicationId));
  const [form, setForm] = useState({ applicationId: data?.applicationId || activeApps[0]?.id || "", salary: "", basicSalary: "", variablePay: "", currency: "EGP", startDate: "", approvalNote: "" });
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const selectedApp = ctx.applications.find(a => String(a.id) === String(form.applicationId));
  const selectedCand = selectedApp ? ctx.candidates.find(c => c.id === selectedApp.candidateId) : null;
  const selectedJob = selectedApp ? ctx.jobs.find(j => j.id === selectedApp.jobId) : null;

  const submit = async () => {
    if (!form.applicationId || !form.salary || !form.startDate) return;
    const salary = parseFloat(form.salary) || 0;
    const basicSalary = parseFloat(form.basicSalary) || Math.round(salary * 0.8);
    const variablePay = parseFloat(form.variablePay) || Math.max(salary - basicSalary, 0);
    try {
      await ctx.backendActions.createOffer({
        applicationId: form.applicationId,
        positionId: selectedApp?.jobId,
        currency: form.currency,
        baseSalary: salary,
        signingBonus: variablePay,
        startDate: form.startDate,
      });
      await ctx.reloadData?.();
      closeModal();
      return;
    } catch (e) {
      alert(e.message);
      return;
    }
    const newOffer = { id: Date.now(), applicationId: form.applicationId, salary, basicSalary, variablePay, currency: form.currency, startDate: form.startDate, status: "Draft", candidateStatus: "Pending candidate", createdBy: ctx.roleConfig.fullName, approvalNote: form.approvalNote, createdDate: new Date().toISOString().split("T")[0] };
    ctx.setOffers(prev => [...prev, newOffer]);
    closeModal();
  };

  return (
    <div className="modal-overlay" onClick={closeModal}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">Create Offer</div>
          <button className="modal-close" onClick={closeModal}>×</button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">Candidate & job *</label>
            <select className="form-select" value={form.applicationId} onChange={e => set("applicationId", e.target.value)}>
              <option value="">— Select candidate —</option>
              {activeApps.map(app => {
                const cand = ctx.candidates.find(c => c.id === app.candidateId);
                const job = ctx.jobs.find(j => j.id === app.jobId);
                return <option key={app.id} value={app.id}>{cand?.name} → {job?.title}</option>;
              })}
            </select>
          </div>
          {selectedJob && (
            <div className="alert alert-info" style={{ marginBottom: 16 }}>
              <Icon name="alert" size={14} />
              <span>Salary band for {selectedJob.title}: {selectedJob.salaryMin.toLocaleString()} – {selectedJob.salaryMax.toLocaleString()} EGP</span>
            </div>
          )}
          <div className="form-row">
            <div className="form-group"><label className="form-label">Proposed salary *</label><input className="form-input" type="number" value={form.salary} onChange={e => set("salary", e.target.value)} placeholder="e.g. 55000" /></div>
            <div className="form-group"><label className="form-label">Currency</label><select className="form-select" value={form.currency} onChange={e => set("currency", e.target.value)}><option>EGP</option><option>USD</option><option>EUR</option></select></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label className="form-label">Basic salary</label><input className="form-input" type="number" value={form.basicSalary} onChange={e => set("basicSalary", e.target.value)} placeholder="48000" /></div>
            <div className="form-group"><label className="form-label">Variable pay</label><input className="form-input" type="number" value={form.variablePay} onChange={e => set("variablePay", e.target.value)} placeholder="10000" /></div>
          </div>
          <div className="form-group"><label className="form-label">Proposed start date *</label><input className="form-input" type="date" value={form.startDate} onChange={e => set("startDate", e.target.value)} /></div>
          <div className="form-group"><label className="form-label">Approver notes</label><textarea className="form-textarea" value={form.approvalNote} onChange={e => set("approvalNote", e.target.value)} placeholder="Compensation context, exceptions, or approval conditions..." /></div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={closeModal}>Cancel</button>
          <button className="btn btn-primary" onClick={submit}>Submit for Approval</button>
        </div>
      </div>
    </div>
  );
}

function ViewOfferModal({ data, closeModal, ctx }) {
  const { offer } = data;
  const { cand, job, app } = offer;
  const canViewSalary = !!ctx.canViewSalary;
  const isPlaceholderName = (value) => {
    const normalized = String(value || "").trim().toLowerCase();
    return !normalized || normalized === "recruiter" || normalized === "unassigned" || normalized === "—";
  };
  const resolveOfferCreator = () => {
    if (!isPlaceholderName(offer.createdBy)) return offer.createdBy;
    if (!isPlaceholderName(app?.recruiter)) return app.recruiter;
    if (!isPlaceholderName(job?.recruiter)) return job.recruiter;
    const recruiterId = app?.recruiterId || job?.recruiterId;
    const recruiterUser = recruiterId ? ctx.allUsers?.find(user => String(user.id) === String(recruiterId)) : null;
    if (!isPlaceholderName(recruiterUser?.fullName)) return recruiterUser.fullName;
    const fallbackRecruiter = ctx.allUsers?.find(user =>
      user?.active !== false &&
      !isPlaceholderName(user?.fullName) &&
      ["Recruiter", "recruiter"].includes(user.role || user.roleKey)
    );
    return fallbackRecruiter?.fullName || "Unassigned";
  };
  const createdByName = resolveOfferCreator();

  const statusColor = offer.status === "Approved" ? "var(--green)" : offer.status === "Pending Approval" ? "var(--amber)" : "var(--red)";
  const basicSalary = offer.basicSalary || Math.round((offer.salary || 0) * 0.8);
  const variablePay = offer.variablePay || Math.max((offer.salary || 0) - basicSalary, 0);

  return (
    <div className="modal-overlay" onClick={closeModal}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">Offer Details</div>
          <button className="modal-close" onClick={closeModal}>×</button>
        </div>
        <div className="modal-body">
          <div style={{ background: "var(--bg3)", borderRadius: "var(--radius-lg)", padding: "20px", marginBottom: 20, border: "1px solid var(--border)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
              <div style={{ width: 44, height: 44, borderRadius: "50%", background: cand?.color + "22", color: cand?.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 700 }}>{cand ? initials(cand.name) : "?"}</div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text)" }}>{cand?.name}</div>
                <div style={{ fontSize: 12, color: "var(--text3)" }}>{job?.title} · {job?.entity}</div>
              </div>
              <span style={{ marginLeft: "auto", padding: "4px 12px", borderRadius: 20, background: statusColor + "22", color: statusColor, fontSize: 12, fontWeight: 500 }}>{offer.status}</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div><div className="form-label">Proposed salary</div><div style={{ fontSize: 22, fontWeight: 600, color: "var(--accent)", fontFamily: "var(--mono)" }}>{canViewSalary ? <>{offer.salary.toLocaleString()} <span style={{ fontSize: 13, color: "var(--text3)" }}>{offer.currency}</span></> : "Restricted"}</div></div>
              <div><div className="form-label">Start date</div><div style={{ fontSize: 15, fontWeight: 500, color: "var(--text)" }}>{offer.startDate}</div></div>
              <div><div className="form-label">Basic salary</div><div style={{ fontSize: 13, color: "var(--text2)", fontFamily: "var(--mono)" }}>{canViewSalary ? `${basicSalary.toLocaleString()} ${offer.currency}` : "Restricted"}</div></div>
              <div><div className="form-label">Variable pay</div><div style={{ fontSize: 13, color: "var(--text2)", fontFamily: "var(--mono)" }}>{canViewSalary ? `${variablePay.toLocaleString()} ${offer.currency}` : "Restricted"}</div></div>
              <div><div className="form-label">Created by</div><div style={{ fontSize: 13, color: "var(--text2)" }}>{createdByName}</div></div>
              <div><div className="form-label">Created date</div><div style={{ fontSize: 13, color: "var(--text2)", fontFamily: "var(--mono)" }}>{offer.createdDate}</div></div>
              <div><div className="form-label">Candidate status</div><span className={`badge ${offer.candidateStatus === "Accepted" ? "badge-green" : offer.candidateStatus === "Rejected" ? "badge-red" : "badge-blue"}`}>{offer.candidateStatus || "Pending candidate"}</span></div>
              <div><div className="form-label">Approver notes</div><div style={{ fontSize: 13, color: "var(--text2)" }}>{offer.approvalNote || "—"}</div></div>
            </div>
          </div>
          {job && canViewSalary && (
            <div className="alert alert-info">
              <Icon name="alert" size={14} />
              <span>Salary band for this role: {job.salaryMin.toLocaleString()} – {job.salaryMax.toLocaleString()} EGP. Proposed: {offer.salary.toLocaleString()} EGP {offer.salary > job.salaryMax ? "⚠ above band" : offer.salary < job.salaryMin ? "⚠ below band" : "✓ within band"}.</span>
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={closeModal}>Close</button>
        </div>
      </div>
    </div>
  );
}

function ScheduleInterviewModal({ data, closeModal, ctx }) {
  const eligibleApps = ctx.applications.filter(a => a.status === "Active" && !["Applied", "Hired", "Rejected", "On Hold"].includes(a.stage));
  const interviewTypeMap = {
    "HR Screening": "phone_screen",
    "1st Interview": "behavioral",
    "Technical Interview": "technical",
    "Panel Interview": "panel",
    "Final Interview": "final",
  };
  const interviewTypeLabel = Object.fromEntries(Object.entries(interviewTypeMap).map(([label, value]) => [value, label]));
  const interviewerOptions = (ctx.allUsers?.length ? ctx.allUsers : TEAM.map(t => ({
    id: t.email,
    email: t.email,
    fullName: t.fullName,
    role: "Interviewer",
    isActive: true,
  })))
    .filter(u => u?.isActive !== false && u.email && u.fullName)
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
  const defaultInterviewerId = String(interviewerOptions.find(u => u.fullName === "Mohi Mohsen")?.id || interviewerOptions[0]?.id || "");
  const [form, setForm] = useState({ applicationId: data?.applicationId || eligibleApps[0]?.id || "", type: "1st Interview", scheduledAt: "", format: "In-person", interviewerMode: "list", interviewerUserId: defaultInterviewerId, interviewerName: "" });
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const submit = async () => {
    if (!form.applicationId || !form.scheduledAt) return;
    const manualInterviewerName = form.interviewerName.trim();
    const selectedInterviewer = form.interviewerMode === "manual"
      ? { fullName: manualInterviewerName, id: "", email: "" }
      : interviewerOptions.find(u =>
      String(u.id || "") === String(form.interviewerUserId || "") ||
      String(u.email || "") === String(form.interviewerUserId || "")
    );
    if (form.interviewerMode === "manual" && !manualInterviewerName) {
      alert("Please enter the interviewer name.");
      return;
    }
    if (!selectedInterviewer) {
      alert("Please select an interviewer from the user list.");
      return;
    }
    try {
      const createdInterview = await ctx.backendActions.createInterview({
        applicationId: form.applicationId,
        ...(selectedInterviewer.id ? { interviewerId: selectedInterviewer.id } : {}),
        ...(selectedInterviewer.email ? { interviewerEmail: selectedInterviewer.email } : {}),
        ...(form.interviewerMode === "manual" ? { interviewerName: manualInterviewerName } : {}),
        type: interviewTypeMap[form.type] || "technical",
        scheduledAt: form.scheduledAt,
        location: form.format === "In-person" ? "Office" : "",
        meetingLink: form.format === "Video call" ? "TBD" : "",
      });
      ctx.setInterviews(prev => [
        ...prev.filter(interview => String(interview.id) !== String(createdInterview?.id)),
        {
          id: createdInterview?.id || Date.now(),
          applicationId: createdInterview?.applicationId || form.applicationId,
          type: interviewTypeLabel[createdInterview?.type] || form.type,
          scheduledAt: createdInterview?.scheduledAt || form.scheduledAt,
          format: createdInterview?.meetingLink ? "Video call" : createdInterview?.location ? "In-person" : form.format,
          interviewerId: selectedInterviewer.fullName,
          interviewerUserId: selectedInterviewer.id || "",
          interviewerEmail: selectedInterviewer.email || "",
          status: createdInterview?.status === "completed" ? "Completed" : "Scheduled",
        },
      ]);
      await ctx.reloadData?.();
      closeModal();
      return;
    } catch (e) {
      alert(e.message);
      return;
    }
    const newInterview = { id: Date.now(), applicationId: form.applicationId, type: form.type, scheduledAt: form.scheduledAt, format: form.format, interviewerId: selectedInterviewer.fullName, status: "Scheduled" };
    ctx.setInterviews(prev => [...prev, newInterview]);
    closeModal();
  };

  return (
    <div className="modal-overlay" onClick={closeModal}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">Schedule Interview</div>
          <button className="modal-close" onClick={closeModal}>×</button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">Candidate *</label>
            <select className="form-select" value={form.applicationId} onChange={e => set("applicationId", e.target.value)}>
              {eligibleApps.map(app => {
                const cand = ctx.candidates.find(c => c.id === app.candidateId);
                const job = ctx.jobs.find(j => j.id === app.jobId);
                return <option key={app.id} value={app.id}>{cand?.name} → {job?.title} ({app.stage})</option>;
              })}
            </select>
          </div>
          <div className="form-row">
            <div className="form-group"><label className="form-label">Interview type</label>
              <select className="form-select" value={form.type} onChange={e => set("type", e.target.value)}>
                {["HR Screening","1st Interview","Technical Interview","Panel Interview","Final Interview"].map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="form-group"><label className="form-label">Format</label>
              <select className="form-select" value={form.format} onChange={e => set("format", e.target.value)}>
                {["In-person","Video call","Phone"].map(f => <option key={f}>{f}</option>)}
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group"><label className="form-label">Date & time *</label><input className="form-input" type="datetime-local" value={form.scheduledAt} onChange={e => set("scheduledAt", e.target.value)} /></div>
            <div className="form-group"><label className="form-label">Interviewer</label>
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <button
                  type="button"
                  className={`btn btn-sm ${form.interviewerMode === "list" ? "btn-primary" : "btn-ghost"}`}
                  onClick={() => set("interviewerMode", "list")}
                >
                  Select user
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${form.interviewerMode === "manual" ? "btn-primary" : "btn-ghost"}`}
                  onClick={() => set("interviewerMode", "manual")}
                >
                  Type name
                </button>
              </div>
              {form.interviewerMode === "manual" ? (
                <input
                  className="form-input"
                  value={form.interviewerName}
                  onChange={e => set("interviewerName", e.target.value)}
                  placeholder="Enter interviewer name"
                />
              ) : (
                <select className="form-select" value={String(form.interviewerUserId || "")} onChange={e => set("interviewerUserId", e.target.value)}>
                  <option value="">Select interviewer</option>
                  {interviewerOptions.map(u => (
                    <option key={u.id || u.email} value={String(u.id || u.email)}>{u.fullName} — {u.email}</option>
                  ))}
                </select>
              )}
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={closeModal}>Cancel</button>
          <button className="btn btn-primary" onClick={submit}>Schedule Interview</button>
        </div>
      </div>
    </div>
  );
}
