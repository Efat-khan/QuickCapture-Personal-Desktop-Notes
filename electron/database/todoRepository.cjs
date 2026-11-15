const { getDb } = require('./connection.cjs');

let statements;

function getStatements() {
  if (statements) return statements;
  const db = getDb();

  statements = {
    list: db.prepare('SELECT * FROM todos WHERE day = ? ORDER BY done, position, id'),
    nextPosition: db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS position FROM todos WHERE day = ?'),
    insert: db.prepare(`
      INSERT INTO todos (day, text, done, position, created_at, updated_at)
      VALUES (@day, @text, 0, @position, @now, @now)
      RETURNING *
    `),
    update: db.prepare(`
      UPDATE todos
      SET text = COALESCE(@text, text),
          done = COALESCE(@done, done),
          completed_at = CASE
            WHEN @done IS NULL THEN completed_at
            WHEN @done = 1 THEN COALESCE(completed_at, @now)
            ELSE NULL
          END,
          updated_at = @now
      WHERE id = @id
      RETURNING *
    `),
    remove: db.prepare('DELETE FROM todos WHERE id = ? RETURNING *'),
    clearDone: db.prepare('DELETE FROM todos WHERE day = ? AND done = 1'),
    countOpenBefore: db.prepare('SELECT COUNT(*) AS count FROM todos WHERE day < ? AND done = 0'),
    openBefore: db.prepare('SELECT id FROM todos WHERE day < ? AND done = 0 ORDER BY day, position, id'),
    moveTo: db.prepare('UPDATE todos SET day = @day, position = @position, updated_at = @now WHERE id = @id'),
  };
  return statements;
}

function normalize(row) {
  return row ? { ...row, done: Boolean(row.done) } : null;
}

function listTodos(day) {
  return getStatements().list.all(day).map(normalize);
}

function createTodo(day, text) {
  const s = getStatements();
  const { position } = s.nextPosition.get(day);
  return normalize(s.insert.get({ day, text, position, now: new Date().toISOString() }));
}

function updateTodo(id, { text, done }) {
  return normalize(
    getStatements().update.get({
      id,
      text: text === undefined ? null : text,
      done: done === undefined ? null : done ? 1 : 0,
      now: new Date().toISOString(),
    })
  );
}

function deleteTodo(id) {
  return normalize(getStatements().remove.get(id));
}

function clearDone(day) {
  return getStatements().clearDone.run(day).changes;
}

function countOpenBefore(day) {
  return getStatements().countOpenBefore.get(day).count;
}

/** Moves every unfinished task from earlier days to the end of `day`'s list. Returns how many moved. */
function carryOver(day) {
  const s = getStatements();
  return getDb().transaction(() => {
    const rows = s.openBefore.all(day);
    let { position } = s.nextPosition.get(day);
    const now = new Date().toISOString();
    for (const { id } of rows) {
      s.moveTo.run({ id, day, position, now });
      position += 1;
    }
    return rows.length;
  })();
}

module.exports = { listTodos, createTodo, updateTodo, deleteTodo, clearDone, countOpenBefore, carryOver };
