import 'fake-indexeddb/auto' // must load before Dexie
import { describe, it, expect, afterEach } from 'vitest'
import Dexie from 'dexie'
import { CentavoDB, CategoryError, DEFAULT_CATEGORIES, V3_CATEGORIES, V6_CATEGORIES, addCategory, deleteCategory, sortCategories, updateCategory } from '../../core/db'
import { firstGrapheme } from '../../shared/utils/text'

const opened: Dexie[] = []
let seq = 0

function freshDB(name = `cat-test-${++seq}`): CentavoDB {
  const db = new CentavoDB(name)
  opened.push(db)
  return db
}

afterEach(async () => {
  for (const db of opened.splice(0)) {
    db.close()
    await Dexie.delete(db.name)
  }
})

describe('default categories', () => {
  it('seeds every default on a new install, with no duplicates', async () => {
    const db = freshDB()
    const all = await db.categories.toArray()
    expect(all).toHaveLength(DEFAULT_CATEGORIES.length)
    const keys = all.map(c => `${c.type}:${c.name}`)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('v3 upgrade adds the new defaults to an existing database without touching old rows', async () => {
    const name = `cat-upgrade-${++seq}`
    const v2 = new Dexie(name)
    v2.version(2).stores({ categories: '++id, type', transactions: '++id, categoryId, type, date, createdAt' })
    await v2.open()
    await v2.table('categories').bulkAdd([
      { name: 'Salário', type: 'income', icon: '💼' },
      { name: 'Alimentação', type: 'expense', icon: '🍔' },
      { name: 'mercado', type: 'expense', icon: '🥦' }, // user-made, different case
    ])
    await v2.table('transactions').add({ type: 'expense', amount: 100, categoryId: 2, date: '2026-11-01', createdAt: 1 })
    v2.close()

    const db = freshDB(name)
    const all = await db.categories.toArray()
    expect(all.slice(0, 3).map(c => [c.id, c.name, c.icon])).toEqual([
      [1, 'Salário', '💼'], [2, 'Alimentação', '🍔'], [3, 'mercado', '🥦'],
    ])
    expect(all.filter(c => c.type === 'expense' && c.name.toLowerCase() === 'mercado')).toHaveLength(1)
    expect(all).toHaveLength(3 + V3_CATEGORIES.length - 1 + V6_CATEGORIES.length)
    expect((await db.transactions.toArray())[0].categoryId).toBe(2)
  })
})

describe('category editing', () => {
  it('adds a category with a trimmed name and a single emoji', async () => {
    const db = freshDB()
    const id = await addCategory({ name: '  Academia   de  luta ', icon: '🥊🥊', type: 'expense' }, db)
    expect(await db.categories.get(id)).toMatchObject({ name: 'Academia de luta', icon: '🥊', type: 'expense' })
  })

  it('rejects empty and duplicate names (case-insensitive, per type)', async () => {
    const db = freshDB()
    await expect(addCategory({ name: '  ', icon: '🏷️', type: 'expense' }, db)).rejects.toBeInstanceOf(CategoryError)
    await expect(addCategory({ name: 'MERCADO', icon: '🛒', type: 'expense' }, db)).rejects.toBeInstanceOf(CategoryError)
    // Same name is fine on the other side
    await expect(addCategory({ name: 'Mercado', icon: '🛒', type: 'income' }, db)).resolves.toBeTypeOf('number')
  })

  it('renames and re-icons, keeping its own name allowed', async () => {
    const db = freshDB()
    const id = await addCategory({ name: 'Acad', icon: '🏋️', type: 'expense' }, db)
    await updateCategory(id, { name: 'acad', icon: '🥋' }, db)
    expect(await db.categories.get(id)).toMatchObject({ name: 'acad', icon: '🥋' })
    await expect(updateCategory(id, { name: 'Pets', icon: '🥋' }, db)).rejects.toBeInstanceOf(CategoryError)
  })

  it('only deletes categories nobody uses', async () => {
    const db = freshDB()
    const used = await addCategory({ name: 'Usada', icon: '🧪', type: 'expense' }, db)
    const free = await addCategory({ name: 'Livre', icon: '🧪', type: 'expense' }, db)
    await db.transactions.add({ type: 'expense', amount: 1, categoryId: used, accountId: 1, date: '2026-11-01', month: '2026-11', createdAt: 1 })
    await expect(deleteCategory(used, db)).rejects.toBeInstanceOf(CategoryError)
    await deleteCategory(free, db)
    expect(await db.categories.get(used)).toBeDefined()
    expect(await db.categories.get(free)).toBeUndefined()
  })
})

describe('sortCategories', () => {
  it('puts built-ins in curated order, custom ones after, Outros last', () => {
    const sorted = sortCategories([
      { id: 99, name: 'Outros' }, { id: 40, name: 'Minha' }, { id: 7, name: 'Transporte' },
      { id: 30, name: 'Mercado' }, { id: 6, name: 'Alimentação' }, { id: 41, name: 'Outra minha' },
    ])
    expect(sorted.map(c => c.name)).toEqual(['Alimentação', 'Mercado', 'Transporte', 'Minha', 'Outra minha', 'Outros'])
  })
})

describe('firstGrapheme', () => {
  it('keeps multi-codepoint emoji whole', () => {
    expect(firstGrapheme('👩‍💻x')).toBe('👩‍💻')
    expect(firstGrapheme(' ✈️ ')).toBe('✈️')
    expect(firstGrapheme('')).toBe('')
  })
})
