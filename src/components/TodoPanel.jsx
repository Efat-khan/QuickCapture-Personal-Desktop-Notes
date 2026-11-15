import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowLeft, Check, ChevronLeft, ChevronRight, ListTodo, Pencil, Plus, Trash2 } from 'lucide-react';
import { describeDay, shiftDayKey, toDayKey } from '../lib/day.js';

const api = window.quickCapture;

const TodoItem = memo(function TodoItem({ todo, onToggle, onEdit, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  // Guards against committing twice (Enter + blur) or after Escape cancelled the edit.
  const activeRef = useRef(false);

  const startEditing = () => {
    activeRef.current = true;
    setDraft(todo.text);
    setEditing(true);
  };

  const commit = () => {
    if (!activeRef.current) return;
    activeRef.current = false;
    setEditing(false);
    const text = draft.trim();
    if (text && text !== todo.text) onEdit(todo, text);
  };

  const cancel = () => {
    activeRef.current = false;
    setEditing(false);
  };

  return (
    <li className={`todo-item ${todo.done ? 'done' : ''}`}>
      <button
        className="todo-check"
        role="checkbox"
        aria-checked={todo.done}
        aria-label={todo.done ? `Mark "${todo.text}" as not done` : `Mark "${todo.text}" as done`}
        onClick={() => onToggle(todo)}
      >
        {todo.done && <Check size={12} strokeWidth={3} />}
      </button>

      {editing ? (
        <input
          className="todo-edit"
          value={draft}
          maxLength={500}
          autoFocus
          aria-label="Edit task"
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commit();
            if (event.key === 'Escape') {
              event.stopPropagation(); // cancel the edit, not the whole window
              cancel();
            }
          }}
        />
      ) : (
        <span className="todo-text" onDoubleClick={startEditing} title="Double-click to edit">
          {todo.text}
        </span>
      )}

      {!editing && (
        <div className="todo-tools">
          <button className="rec-tool" onClick={startEditing} title="Edit" aria-label="Edit task">
            <Pencil size={13} />
          </button>
          <button className="rec-tool danger" onClick={() => onDelete(todo)} title="Delete" aria-label="Delete task">
            <Trash2 size={13} />
          </button>
        </div>
      )}
    </li>
  );
});

function sortTodos(items) {
  // Open tasks first (in the order they were added), finished ones underneath.
  return [...items].sort((a, b) => a.done - b.done || a.position - b.position || a.id - b.id);
}

/** A separate to-do list for every day. Loads and saves its own data. */
export function TodoPanel({ notify, onClose }) {
  // "Today" as of when the window opened (it remounts each time it is opened).
  const [today] = useState(() => toDayKey());
  const [day, setDay] = useState(today);
  // The list is tagged with the day it was loaded for, so switching days never shows the wrong list.
  const [loaded, setLoaded] = useState({ day: null, items: [] });
  const [olderOpen, setOlderOpen] = useState({ day: null, count: 0 });
  const [reloadToken, setReloadToken] = useState(0);
  const [draft, setDraft] = useState('');
  const inputRef = useRef(null);

  const items = loaded.day === day ? loaded.items : null;
  const sorted = useMemo(() => (items ? sortTodos(items) : []), [items]);
  const doneCount = sorted.filter((todo) => todo.done).length;
  const total = sorted.length;
  const isToday = day === today;
  const carryOverCount = isToday && olderOpen.day === day ? olderOpen.count : 0;
  const { label, date } = describeDay(day, today);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.todos.list(day), day === today ? api.todos.openBefore(day) : Promise.resolve(0)])
      .then(([list, older]) => {
        if (cancelled) return;
        setLoaded({ day, items: list });
        setOlderOpen({ day, count: older });
      })
      .catch((error) => {
        if (!cancelled) notify(`Could not load tasks: ${error.message}`, 'error');
      });
    return () => {
      cancelled = true;
    };
  }, [day, today, reloadToken, notify]);

  const updateItems = useCallback((change) => setLoaded((previous) => ({ ...previous, items: change(previous.items) })), []);

  const addTask = async (event) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    try {
      const todo = await api.todos.create(day, text);
      setLoaded((previous) => (previous.day === day ? { ...previous, items: [...previous.items, todo] } : previous));
    } catch (error) {
      setDraft(text);
      notify(`Could not add task: ${error.message}`, 'error');
    }
    inputRef.current?.focus();
  };

  // Optimistic: the checkbox flips immediately and is rolled back if saving fails.
  const toggleTask = useCallback(
    async (todo) => {
      const replaceWith = (next) => (list) => list.map((item) => (item.id === todo.id ? next : item));
      updateItems(replaceWith({ ...todo, done: !todo.done }));
      try {
        updateItems(replaceWith(await api.todos.update(todo.id, { done: !todo.done })));
      } catch (error) {
        updateItems(replaceWith(todo));
        notify(`Could not update task: ${error.message}`, 'error');
      }
    },
    [notify, updateItems]
  );

  const editTask = useCallback(
    async (todo, text) => {
      const replaceWith = (next) => (list) => list.map((item) => (item.id === todo.id ? next : item));
      updateItems(replaceWith({ ...todo, text }));
      try {
        updateItems(replaceWith(await api.todos.update(todo.id, { text })));
      } catch (error) {
        updateItems(replaceWith(todo));
        notify(`Could not edit task: ${error.message}`, 'error');
      }
    },
    [notify, updateItems]
  );

  const deleteTask = useCallback(
    async (todo) => {
      updateItems((list) => list.filter((item) => item.id !== todo.id));
      try {
        await api.todos.delete(todo.id);
      } catch (error) {
        updateItems((list) => [...list, todo]);
        notify(`Could not delete task: ${error.message}`, 'error');
      }
    },
    [notify, updateItems]
  );

  const clearCompleted = async () => {
    try {
      await api.todos.clearDone(day);
      updateItems((list) => list.filter((item) => !item.done));
    } catch (error) {
      notify(`Could not clear tasks: ${error.message}`, 'error');
    }
  };

  const moveUnfinishedToToday = async () => {
    try {
      const moved = await api.todos.carryOver(today);
      notify(`Moved ${moved} ${moved === 1 ? 'task' : 'tasks'} to today`);
      setReloadToken((value) => value + 1);
    } catch (error) {
      notify(`Could not move tasks: ${error.message}`, 'error');
    }
  };

  return (
    <div className="panel todo-panel">
      <header className="todo-header drag-region">
        <span className="editor-icon">
          <ListTodo size={14} />
        </span>
        <h2>To-do</h2>
        <div className="todo-day no-drag">
          <button className="rec-tool" onClick={() => setDay(shiftDayKey(day, -1))} title="Previous day" aria-label="Previous day">
            <ChevronLeft size={15} />
          </button>
          <div className="todo-day-label" aria-live="polite">
            <strong>{label}</strong>
            <span>{date}</span>
          </div>
          <button className="rec-tool" onClick={() => setDay(shiftDayKey(day, 1))} title="Next day" aria-label="Next day">
            <ChevronRight size={15} />
          </button>
        </div>
      </header>

      {!isToday && (
        <button className="todo-back-today" onClick={() => setDay(today)}>
          Back to today
        </button>
      )}

      <div className="todo-progress" aria-label={`${doneCount} of ${total} tasks done`}>
        <div className="todo-progress-bar">
          <span style={{ width: total ? `${(doneCount / total) * 100}%` : 0 }} />
        </div>
        <span className="todo-progress-text">
          {total === 0 ? 'No tasks' : doneCount === total ? 'All done 🎉' : `${doneCount} of ${total} done`}
        </span>
      </div>

      {carryOverCount > 0 && (
        <div className="todo-banner">
          <span>
            {carryOverCount} unfinished {carryOverCount === 1 ? 'task' : 'tasks'} from earlier days
          </span>
          <button onClick={moveUnfinishedToToday}>
            <ArrowDownToLine size={13} /> Move to today
          </button>
        </div>
      )}

      <form className="todo-add" onSubmit={addTask}>
        <input
          ref={inputRef}
          className="field"
          placeholder={isToday ? 'Add a task for today…' : `Add a task for ${label}…`}
          value={draft}
          maxLength={500}
          autoFocus
          aria-label="New task"
          onChange={(event) => setDraft(event.target.value)}
        />
        <button className="primary" type="submit" aria-label="Add task" title="Add task (Enter)">
          <Plus size={16} />
        </button>
      </form>

      <ul className="todo-list">
        {items !== null && total === 0 && (
          <li className="todo-empty">{isToday ? 'Nothing planned yet. Add your first task above.' : 'No tasks on this day.'}</li>
        )}
        {sorted.map((todo) => (
          <TodoItem key={todo.id} todo={todo} onToggle={toggleTask} onEdit={editTask} onDelete={deleteTask} />
        ))}
      </ul>

      <div className="actions-row">
        {doneCount > 0 && (
          <button className="ghost todo-clear" onClick={clearCompleted}>
            Clear completed ({doneCount})
          </button>
        )}
        <button className="ghost back-btn" onClick={onClose} title="Back to the widget (Esc)">
          <ArrowLeft size={14} /> Back
        </button>
      </div>
    </div>
  );
}
