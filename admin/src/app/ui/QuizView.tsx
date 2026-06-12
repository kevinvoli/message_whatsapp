'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Pencil, Trash2, Plus, X, Check } from 'lucide-react';
import {
  getQuizCategories,
  createQuizCategory,
  updateQuizCategory,
  deleteQuizCategory,
  getQuizQuestions,
  createQuizQuestion,
  archiveQuizQuestion,
  getQuizSessions,
  createQuizSession,
  updateQuizSession,
  deleteQuizSession,
  duplicateQuizSession,
} from '@/app/lib/api';
import { QuizCategory, QuizQuestion, QuizSession } from '@/app/lib/definitions';
import { useToast } from '@/app/ui/ToastProvider';
import { logger } from '@/app/lib/logger';

// ─── Types internes ────────────────────────────────────────────────────────────

type QuizTab = 'categories' | 'questions' | 'sessions' | 'documents' | 'exemptions' | 'resultats';

interface AnswerDraft {
  text: string;
  isCorrect: boolean;
}

interface QuestionFormState {
  categoryId: string;
  text: string;
  points: number;
  timerEnabled: boolean;
  timerPreset: '15' | '30' | '45' | '60' | 'custom';
  timerCustom: number;
  answers: AnswerDraft[];
}

interface SessionFormState {
  title: string;
  sessionDate: string;
  isActive: boolean;
  passingScoreEnabled: boolean;
  passingScore: number;
  maxAttempts: number;
  timeLimitEnabled: boolean;
  totalTimeMinutes: number;
  selectedQuestionIds: string[];
  questionCategoryFilter: string;
}

interface DuplicateSectionState {
  open: boolean;
  dates: string[];
  result: { created: string[]; skipped: string[] } | null;
}

// ─── Constantes ────────────────────────────────────────────────────────────────

const TABS: { key: QuizTab; label: string }[] = [
  { key: 'categories', label: 'Catégories' },
  { key: 'questions', label: 'Questions' },
  { key: 'sessions', label: 'Sessions' },
  { key: 'documents', label: 'Documents' },
  { key: 'exemptions', label: 'Exemptions' },
  { key: 'resultats', label: 'Résultats' },
];

const TIMER_PRESETS = [
  { value: '15', label: '15s' },
  { value: '30', label: '30s' },
  { value: '45', label: '45s' },
  { value: '60', label: '60s' },
  { value: 'custom', label: 'Personnalisé' },
] as const;

const DAYS_FR = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

function emptyQuestionForm(firstCategoryId = ''): QuestionFormState {
  return {
    categoryId: firstCategoryId,
    text: '',
    points: 1,
    timerEnabled: false,
    timerPreset: '30',
    timerCustom: 30,
    answers: [
      { text: '', isCorrect: false },
      { text: '', isCorrect: false },
    ],
  };
}

function emptySessionForm(date = ''): SessionFormState {
  return {
    title: '',
    sessionDate: date,
    isActive: true,
    passingScoreEnabled: false,
    passingScore: 10,
    maxAttempts: 1,
    timeLimitEnabled: false,
    totalTimeMinutes: 15,
    selectedQuestionIds: [],
    questionCategoryFilter: '',
  };
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number): number {
  const day = new Date(year, month, 1).getDay();
  return day === 0 ? 6 : day - 1;
}

function toIsoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function resolveTimerSeconds(form: QuestionFormState): number | undefined {
  if (!form.timerEnabled) return undefined;
  if (form.timerPreset === 'custom') return form.timerCustom;
  return parseInt(form.timerPreset, 10);
}

// ─── Placeholder ───────────────────────────────────────────────────────────────

function ComingSoonPlaceholder() {
  return (
    <div className="flex items-center justify-center h-64 text-gray-400">
      <p>Fonctionnalité à venir — Sprint suivant</p>
    </div>
  );
}

// ─── Onglet Catégories ─────────────────────────────────────────────────────────

function CategoriesTab() {
  const { addToast } = useToast();
  const [categories, setCategories] = useState<QuizCategory[]>([]);
  const [loading, setLoading] = useState(false);

  const [formName, setFormName] = useState('');
  const [formColor, setFormColor] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setCategories(await getQuizCategories());
    } catch (e) {
      logger.error('getQuizCategories', { error: e });
      addToast({ type: 'error', message: 'Erreur lors du chargement des catégories' });
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { void load(); }, [load]);

  const resetForm = () => {
    setFormName('');
    setFormColor('');
    setEditingId(null);
  };

  const handleEdit = (cat: QuizCategory) => {
    setEditingId(cat.id);
    setFormName(cat.name);
    setFormColor(cat.color ?? '');
  };

  const handleSubmit = async () => {
    if (!formName.trim()) return;
    try {
      if (editingId) {
        await updateQuizCategory(editingId, { name: formName.trim(), color: formColor || undefined });
        addToast({ type: 'success', message: 'Catégorie mise à jour' });
      } else {
        await createQuizCategory({ name: formName.trim(), color: formColor || undefined });
        addToast({ type: 'success', message: 'Catégorie créée' });
      }
      resetForm();
      void load();
    } catch (e) {
      logger.error('saveQuizCategory', { error: e });
      addToast({ type: 'error', message: 'Erreur lors de la sauvegarde' });
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Supprimer cette catégorie ?')) return;
    try {
      await deleteQuizCategory(id);
      addToast({ type: 'success', message: 'Catégorie supprimée' });
      void load();
    } catch (e) {
      logger.error('deleteQuizCategory', { error: e });
      addToast({ type: 'error', message: 'Erreur lors de la suppression' });
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">
          {editingId ? 'Modifier la catégorie' : 'Nouvelle catégorie'}
        </h3>
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <label className="block text-xs text-gray-500 mb-1">Nom</label>
            <input
              type="text"
              value={formName}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormName(e.target.value)}
              placeholder="Nom de la catégorie"
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Couleur</label>
            <input
              type="color"
              value={formColor || '#6b7280'}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormColor(e.target.value)}
              className="w-10 h-9 rounded border border-gray-300 cursor-pointer"
              title="Couleur (optionnel)"
            />
          </div>
          <button
            onClick={handleSubmit}
            disabled={!formName.trim()}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {editingId ? 'Enregistrer' : 'Ajouter'}
          </button>
          {editingId && (
            <button
              onClick={resetForm}
              className="px-4 py-2 bg-gray-100 text-gray-700 text-sm rounded-md hover:bg-gray-200"
            >
              Annuler
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400 text-sm">Chargement...</div>
        ) : categories.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">Aucune catégorie</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Nom</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Couleur</th>
                <th className="px-4 py-3 font-medium text-gray-600 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {categories.map((cat) => (
                <tr key={cat.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-900">{cat.name}</td>
                  <td className="px-4 py-3">
                    {cat.color ? (
                      <div
                        className="w-5 h-5 rounded-full inline-block border border-gray-200"
                        style={{ backgroundColor: cat.color }}
                        title={cat.color}
                      />
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => handleEdit(cat)}
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                        title="Modifier"
                        aria-label={`Modifier ${cat.name}`}
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(cat.id)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                        title="Supprimer"
                        aria-label={`Supprimer ${cat.name}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── Onglet Questions ─────────────────────────────────────────────────────────

function QuestionsTab() {
  const { addToast } = useToast();
  const [categories, setCategories] = useState<QuizCategory[]>([]);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterCategoryId, setFilterCategoryId] = useState('');
  const [searchText, setSearchText] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<QuestionFormState>(emptyQuestionForm());

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [cats, qs] = await Promise.all([getQuizCategories(), getQuizQuestions()]);
      setCategories(cats);
      setQuestions(qs);
      if (!form.categoryId && cats.length > 0) {
        setForm((f) => ({ ...f, categoryId: cats[0].id }));
      }
    } catch (e) {
      logger.error('loadQuestionsData', { error: e });
      addToast({ type: 'error', message: 'Erreur lors du chargement' });
    } finally {
      setLoading(false);
    }
  }, [addToast, form.categoryId]);

  useEffect(() => { void loadData(); }, [loadData]);

  const filtered = questions.filter((q) => {
    if (filterCategoryId && q.categoryId !== filterCategoryId) return false;
    if (searchText && !q.text.toLowerCase().includes(searchText.toLowerCase())) return false;
    return true;
  });

  const handleAnswerTextChange = (idx: number, text: string) => {
    setForm((f) => {
      const answers = [...f.answers];
      answers[idx] = { ...answers[idx], text };
      return { ...f, answers };
    });
  };

  const handleAnswerCorrectChange = (idx: number) => {
    setForm((f) => ({
      ...f,
      answers: f.answers.map((a, i) => ({ ...a, isCorrect: i === idx })),
    }));
  };

  const handleAddAnswer = () => {
    if (form.answers.length >= 5) return;
    setForm((f) => ({ ...f, answers: [...f.answers, { text: '', isCorrect: false }] }));
  };

  const handleRemoveAnswer = (idx: number) => {
    if (form.answers.length <= 2) return;
    setForm((f) => ({ ...f, answers: f.answers.filter((_, i) => i !== idx) }));
  };

  const validateForm = (): string | null => {
    if (!form.text.trim()) return 'Le texte de la question est requis.';
    if (!form.categoryId) return 'Une catégorie est requise.';
    if (form.answers.length < 2) return 'Au moins 2 réponses sont requises.';
    if (!form.answers.some((a) => a.isCorrect)) return 'Une bonne réponse doit être sélectionnée.';
    if (form.answers.some((a) => !a.text.trim())) return 'Toutes les réponses doivent avoir un texte.';
    return null;
  };

  const handleSubmit = async () => {
    const err = validateForm();
    if (err) { addToast({ type: 'error', message: err }); return; }
    try {
      await createQuizQuestion({
        categoryId: form.categoryId,
        text: form.text.trim(),
        points: form.points,
        timeLimitSeconds: resolveTimerSeconds(form),
        answers: form.answers.map((a, i) => ({ text: a.text.trim(), isCorrect: a.isCorrect, position: i })),
      });
      addToast({ type: 'success', message: 'Question créée' });
      setShowForm(false);
      setForm(emptyQuestionForm(categories[0]?.id ?? ''));
      void loadData();
    } catch (e) {
      logger.error('createQuizQuestion', { error: e });
      addToast({ type: 'error', message: 'Erreur lors de la création' });
    }
  };

  const handleArchive = async (id: string) => {
    if (!window.confirm('Archiver cette question ?')) return;
    try {
      await archiveQuizQuestion(id);
      addToast({ type: 'success', message: 'Question archivée' });
      void loadData();
    } catch (e) {
      logger.error('archiveQuizQuestion', { error: e });
      addToast({ type: 'error', message: "Erreur lors de l'archivage" });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-3 items-center flex-wrap">
        <select
          value={filterCategoryId}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFilterCategoryId(e.target.value)}
          className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          aria-label="Filtrer par catégorie"
        >
          <option value="">Toutes les catégories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <input
          type="text"
          value={searchText}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchText(e.target.value)}
          placeholder="Rechercher..."
          className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 flex-1 min-w-[180px]"
          aria-label="Rechercher une question"
        />
        <button
          onClick={() => { setShowForm(true); setForm(emptyQuestionForm(categories[0]?.id ?? '')); }}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700"
        >
          <Plus className="w-4 h-4" />
          Nouvelle question
        </button>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400 text-sm">Chargement...</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">Aucune question</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Question</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Catégorie</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Points</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Timer</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Réponses</th>
                <th className="px-4 py-3 font-medium text-gray-600 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((q) => (
                <tr key={q.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-900 max-w-xs">
                    {q.text.length > 80 ? `${q.text.slice(0, 80)}…` : q.text}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{q.category?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{q.points}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {q.timeLimitSeconds != null ? `${q.timeLimitSeconds}s` : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{q.answers.length}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleArchive(q.id)}
                      className="p-1.5 text-gray-400 hover:text-orange-600 hover:bg-orange-50 rounded"
                      title="Archiver"
                      aria-label={`Archiver la question`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showForm && (
        <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-gray-700">Nouvelle question</h3>
            <button
              onClick={() => setShowForm(false)}
              className="p-1 text-gray-400 hover:text-gray-600"
              aria-label="Fermer le formulaire"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Texte de la question</label>
            <textarea
              value={form.text}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setForm((f) => ({ ...f, text: e.target.value }))}
              rows={3}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Saisir la question..."
            />
          </div>

          <div className="flex gap-4 flex-wrap">
            <div className="flex-1 min-w-[160px]">
              <label className="block text-xs text-gray-500 mb-1">Catégorie</label>
              <select
                value={form.categoryId}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setForm((f) => ({ ...f, categoryId: e.target.value }))}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="w-24">
              <label className="block text-xs text-gray-500 mb-1">Points</label>
              <input
                type="number"
                min={1}
                value={form.points}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, points: parseInt(e.target.value) || 1 }))}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={form.timerEnabled}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, timerEnabled: e.target.checked }))}
                className="rounded"
              />
              Timer par question
            </label>
            {form.timerEnabled && (
              <div className="mt-2 flex gap-2 items-center flex-wrap">
                {TIMER_PRESETS.map((p) => (
                  <button
                    key={p.value}
                    onClick={() => setForm((f) => ({ ...f, timerPreset: p.value }))}
                    className={`px-3 py-1 text-xs rounded-full border ${
                      form.timerPreset === p.value
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
                {form.timerPreset === 'custom' && (
                  <input
                    type="number"
                    min={5}
                    max={300}
                    value={form.timerCustom}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, timerCustom: parseInt(e.target.value) || 30 }))}
                    className="w-20 border border-gray-300 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="sec"
                  />
                )}
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs text-gray-500">Réponses (1 bonne réponse obligatoire)</label>
              <button
                onClick={handleAddAnswer}
                disabled={form.answers.length >= 5}
                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Plus className="w-3 h-3" />
                Ajouter une réponse
              </button>
            </div>
            <div className="space-y-2">
              {form.answers.map((a, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="correct-answer"
                    checked={a.isCorrect}
                    onChange={() => handleAnswerCorrectChange(idx)}
                    className="shrink-0 text-green-600"
                    title="Bonne réponse"
                    aria-label={`Marquer la réponse ${idx + 1} comme bonne`}
                  />
                  <input
                    type="text"
                    value={a.text}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleAnswerTextChange(idx, e.target.value)}
                    placeholder={`Réponse ${idx + 1}`}
                    className="flex-1 border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={() => handleRemoveAnswer(idx)}
                    disabled={form.answers.length <= 2}
                    className="p-1 text-gray-400 hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed"
                    aria-label={`Supprimer la réponse ${idx + 1}`}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              onClick={handleSubmit}
              className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700"
            >
              Enregistrer
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="px-4 py-2 bg-gray-100 text-gray-700 text-sm rounded-md hover:bg-gray-200"
            >
              Annuler
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Onglet Sessions ─────────────────────────────────────────────────────────

function SessionsTab() {
  const { addToast } = useToast();
  const [sessions, setSessions] = useState<QuizSession[]>([]);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [categories, setCategories] = useState<QuizCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [calendarYear, setCalendarYear] = useState(() => new Date().getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(() => new Date().getMonth());

  const [editingSession, setEditingSession] = useState<QuizSession | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<SessionFormState>(emptySessionForm());
  const [duplicate, setDuplicate] = useState<DuplicateSectionState>({ open: false, dates: [], result: null });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [sess, qs, cats] = await Promise.all([getQuizSessions(), getQuizQuestions(), getQuizCategories()]);
      setSessions(sess);
      setQuestions(qs.filter((q) => q.isActive));
      setCategories(cats);
    } catch (e) {
      logger.error('loadSessionsData', { error: e });
      addToast({ type: 'error', message: 'Erreur lors du chargement' });
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { void loadData(); }, [loadData]);

  const sessionsByDate = React.useMemo(() => {
    const map = new Map<string, QuizSession>();
    sessions.forEach((s) => map.set(s.sessionDate.slice(0, 10), s));
    return map;
  }, [sessions]);

  const openCreate = (date: string) => {
    setEditingSession(null);
    setForm(emptySessionForm(date));
    setDuplicate({ open: false, dates: [], result: null });
    setShowForm(true);
  };

  const openEdit = (session: QuizSession) => {
    setEditingSession(session);
    setForm({
      title: session.title,
      sessionDate: session.sessionDate.slice(0, 10),
      isActive: session.isActive,
      passingScoreEnabled: session.passingScore != null,
      passingScore: session.passingScore ?? 10,
      maxAttempts: session.maxAttempts,
      timeLimitEnabled: session.totalTimeMinutes != null,
      totalTimeMinutes: session.totalTimeMinutes ?? 15,
      selectedQuestionIds: [],
      questionCategoryFilter: '',
    });
    setDuplicate({ open: false, dates: [], result: null });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.title.trim()) { addToast({ type: 'error', message: 'Le titre est requis' }); return; }
    if (!form.sessionDate) { addToast({ type: 'error', message: 'La date est requise' }); return; }
    const dto = {
      title: form.title.trim(),
      sessionDate: form.sessionDate,
      isActive: form.isActive,
      passingScore: form.passingScoreEnabled ? form.passingScore : undefined,
      maxAttempts: form.maxAttempts,
      totalTimeMinutes: form.timeLimitEnabled ? form.totalTimeMinutes : undefined,
      questionIds: form.selectedQuestionIds,
    };
    try {
      if (editingSession) {
        await updateQuizSession(editingSession.id, dto);
        addToast({ type: 'success', message: 'Session mise à jour' });
      } else {
        await createQuizSession(dto);
        addToast({ type: 'success', message: 'Session créée' });
      }
      setShowForm(false);
      setEditingSession(null);
      void loadData();
    } catch (e) {
      logger.error('saveQuizSession', { error: e });
      addToast({ type: 'error', message: 'Erreur lors de la sauvegarde' });
    }
  };

  const handleDelete = async () => {
    if (!editingSession) return;
    if (!window.confirm('Supprimer cette session ?')) return;
    try {
      await deleteQuizSession(editingSession.id);
      addToast({ type: 'success', message: 'Session supprimée' });
      setShowForm(false);
      setEditingSession(null);
      void loadData();
    } catch (e) {
      logger.error('deleteQuizSession', { error: e });
      addToast({ type: 'error', message: 'Erreur lors de la suppression' });
    }
  };

  const handleDuplicate = async () => {
    if (!editingSession) return;
    const validDates = duplicate.dates.filter((d) => d.trim());
    if (validDates.length === 0) { addToast({ type: 'error', message: 'Ajoutez au moins une date' }); return; }
    try {
      const result = await duplicateQuizSession(editingSession.id, validDates);
      setDuplicate((d) => ({ ...d, result }));
      addToast({ type: 'success', message: `${result.created.length} session(s) créée(s)` });
      void loadData();
    } catch (e) {
      logger.error('duplicateQuizSession', { error: e });
      addToast({ type: 'error', message: 'Erreur lors de la duplication' });
    }
  };

  const toggleQuestionSelection = (id: string) => {
    setForm((f) => ({
      ...f,
      selectedQuestionIds: f.selectedQuestionIds.includes(id)
        ? f.selectedQuestionIds.filter((q) => q !== id)
        : [...f.selectedQuestionIds, id],
    }));
  };

  const daysInMonth = getDaysInMonth(calendarYear, calendarMonth);
  const firstDay = getFirstDayOfMonth(calendarYear, calendarMonth);
  const cells: Array<{ day: number | null }> = [];
  for (let i = 0; i < firstDay; i++) cells.push({ day: null });
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d });

  const filteredQuestionsForForm = form.questionCategoryFilter
    ? questions.filter((q) => q.categoryId === form.questionCategoryFilter)
    : questions;

  const MONTH_FR = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => {
              if (calendarMonth === 0) { setCalendarMonth(11); setCalendarYear((y) => y - 1); }
              else setCalendarMonth((m) => m - 1);
            }}
            className="p-1.5 text-gray-500 hover:bg-gray-100 rounded"
            aria-label="Mois précédent"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="text-sm font-semibold text-gray-800">
            {MONTH_FR[calendarMonth]} {calendarYear}
          </span>
          <button
            onClick={() => {
              if (calendarMonth === 11) { setCalendarMonth(0); setCalendarYear((y) => y + 1); }
              else setCalendarMonth((m) => m + 1);
            }}
            className="p-1.5 text-gray-500 hover:bg-gray-100 rounded"
            aria-label="Mois suivant"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {loading ? (
          <div className="py-8 text-center text-gray-400 text-sm">Chargement...</div>
        ) : (
          <div className="grid grid-cols-7 gap-px bg-gray-200 rounded overflow-hidden">
            {DAYS_FR.map((d) => (
              <div key={d} className="bg-gray-50 text-center text-xs font-medium text-gray-500 py-2">
                {d}
              </div>
            ))}
            {cells.map((cell, i) => {
              if (cell.day === null) {
                return <div key={`empty-${i}`} className="bg-white min-h-[72px]" />;
              }
              const dateStr = toIsoDate(calendarYear, calendarMonth, cell.day);
              const session = sessionsByDate.get(dateStr);
              return (
                <div
                  key={dateStr}
                  onClick={() => session ? openEdit(session) : openCreate(dateStr)}
                  className={`min-h-[72px] p-1.5 cursor-pointer transition-colors ${
                    session
                      ? session.isActive
                        ? 'bg-green-50 hover:bg-green-100'
                        : 'bg-gray-100 hover:bg-gray-200'
                      : 'bg-white hover:bg-blue-50 border border-dashed border-gray-200'
                  }`}
                >
                  <div className={`text-xs font-medium mb-0.5 ${session ? 'text-gray-700' : 'text-gray-400'}`}>
                    {cell.day}
                  </div>
                  {session && (
                    <div>
                      <div className="text-xs font-medium text-gray-800 leading-tight truncate">
                        {session.title}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {session.questionCount ?? '?'} question(s)
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showForm && (
        <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">
              {editingSession ? 'Modifier la session' : 'Nouvelle session'}
            </h3>
            <button
              onClick={() => { setShowForm(false); setEditingSession(null); }}
              className="p-1 text-gray-400 hover:text-gray-600"
              aria-label="Fermer le formulaire"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs text-gray-500 mb-1">Titre</label>
              <input
                type="text"
                value={form.title}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, title: e.target.value }))}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Titre de la session"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Date</label>
              <input
                type="date"
                value={form.sessionDate}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, sessionDate: e.target.value }))}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                  className="rounded"
                />
                Active
              </label>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer mb-2">
                <input
                  type="checkbox"
                  checked={form.passingScoreEnabled}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, passingScoreEnabled: e.target.checked }))}
                  className="rounded"
                />
                Score de passage requis
              </label>
              {form.passingScoreEnabled && (
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Score requis (points)</label>
                  <input
                    type="number"
                    min={1}
                    value={form.passingScore}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, passingScore: parseInt(e.target.value) || 1 }))}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Tentatives max</label>
              <select
                value={form.maxAttempts}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setForm((f) => ({ ...f, maxAttempts: parseInt(e.target.value) }))}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value={1}>1</option>
                <option value={2}>2</option>
                <option value={3}>3</option>
                <option value={0}>Illimité</option>
              </select>
            </div>
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer mb-2">
              <input
                type="checkbox"
                checked={form.timeLimitEnabled}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, timeLimitEnabled: e.target.checked }))}
                className="rounded"
              />
              Durée totale limitée
            </label>
            {form.timeLimitEnabled && (
              <div>
                <label className="block text-xs text-gray-500 mb-1">Durée (minutes)</label>
                <input
                  type="number"
                  min={1}
                  value={form.totalTimeMinutes}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, totalTimeMinutes: parseInt(e.target.value) || 1 }))}
                  className="w-32 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center gap-3 mb-2">
              <label className="block text-xs text-gray-500">Questions ({form.selectedQuestionIds.length} sélectionnée(s))</label>
              <select
                value={form.questionCategoryFilter}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setForm((f) => ({ ...f, questionCategoryFilter: e.target.value }))}
                className="border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none"
                aria-label="Filtrer les questions par catégorie"
              >
                <option value="">Toutes</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-md divide-y divide-gray-100">
              {filteredQuestionsForForm.length === 0 ? (
                <div className="p-3 text-sm text-gray-400">Aucune question disponible</div>
              ) : (
                filteredQuestionsForForm.map((q) => (
                  <label
                    key={q.id}
                    className="flex items-start gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={form.selectedQuestionIds.includes(q.id)}
                      onChange={() => toggleQuestionSelection(q.id)}
                      className="mt-0.5 rounded"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-gray-800 truncate">{q.text}</div>
                      <div className="text-xs text-gray-500">{q.category?.name ?? '—'} · {q.points} pt(s)</div>
                    </div>
                  </label>
                ))
              )}
            </div>
          </div>

          {editingSession && (
            <div className="border-t border-gray-200 pt-4">
              <button
                onClick={() => setDuplicate((d) => ({ ...d, open: !d.open }))}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                {duplicate.open ? 'Masquer la duplication' : 'Dupliquer vers d\'autres dates'}
              </button>
              {duplicate.open && (
                <div className="mt-3 space-y-2">
                  {duplicate.dates.map((d, i) => (
                    <div key={i} className="flex gap-2">
                      <input
                        type="date"
                        value={d}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          setDuplicate((prev) => {
                            const dates = [...prev.dates];
                            dates[i] = e.target.value;
                            return { ...prev, dates };
                          })
                        }
                        className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <button
                        onClick={() => setDuplicate((prev) => ({ ...prev, dates: prev.dates.filter((_, j) => j !== i) }))}
                        className="p-1 text-gray-400 hover:text-red-500"
                        aria-label="Supprimer cette date"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => setDuplicate((prev) => ({ ...prev, dates: [...prev.dates, ''] }))}
                    className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
                  >
                    <Plus className="w-3 h-3" />
                    Ajouter une date
                  </button>
                  <button
                    onClick={handleDuplicate}
                    className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700"
                  >
                    Dupliquer
                  </button>
                  {duplicate.result && (
                    <div className="mt-2 text-xs text-gray-600 space-y-0.5">
                      <div className="flex items-center gap-1 text-green-600">
                        <Check className="w-3 h-3" />
                        {duplicate.result.created.length} créée(s) : {duplicate.result.created.join(', ')}
                      </div>
                      {duplicate.result.skipped.length > 0 && (
                        <div className="text-orange-500">
                          {duplicate.result.skipped.length} ignorée(s) (déjà existante) : {duplicate.result.skipped.join(', ')}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700"
            >
              Enregistrer
            </button>
            <button
              onClick={() => { setShowForm(false); setEditingSession(null); }}
              className="px-4 py-2 bg-gray-100 text-gray-700 text-sm rounded-md hover:bg-gray-200"
            >
              Annuler
            </button>
            {editingSession && (
              <button
                onClick={handleDelete}
                className="px-4 py-2 bg-red-600 text-white text-sm rounded-md hover:bg-red-700 ml-auto"
              >
                Supprimer
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Composant principal ───────────────────────────────────────────────────────

export default function QuizView() {
  const [activeTab, setActiveTab] = useState<QuizTab>('categories');

  const renderTab = () => {
    switch (activeTab) {
      case 'categories': return <CategoriesTab />;
      case 'questions': return <QuestionsTab />;
      case 'sessions': return <SessionsTab />;
      default: return <ComingSoonPlaceholder />;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">QCM Formation</h1>
      </div>

      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-6" aria-label="Onglets QCM">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {renderTab()}
    </div>
  );
}
