import { useEffect, useMemo, useState } from 'react';
import {
  computeBalances,
  settle,
  type Expense,
  type SettleResult,
} from './lib/split';
import { formatCents, parseYuanToCents } from './lib/money';
import { renderBillImage, type BillData } from './lib/billImage';

const STORAGE_KEY = 'aa-splitter-v1';

interface SavedState {
  people: string[];
  expenses: Expense[];
}

function loadState(): SavedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { people: [], expenses: [] };
    const parsed = JSON.parse(raw) as SavedState;
    if (!Array.isArray(parsed.people) || !Array.isArray(parsed.expenses)) {
      return { people: [], expenses: [] };
    }
    return parsed;
  } catch {
    return { people: [], expenses: [] };
  }
}

function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

const SAMPLE_PEOPLE = ['小明', '小红', '阿强', '小李'];

function sampleExpenses(): Expense[] {
  const now = Date.now();
  return [
    {
      id: uid(),
      payer: '小明',
      amountCents: 42000,
      participants: ['小明', '小红', '阿强', '小李'],
      note: '火锅',
      createdAt: now,
    },
    {
      id: uid(),
      payer: '小红',
      amountCents: 8600,
      participants: ['小明', '小红', '阿强', '小李'],
      note: '打车',
      createdAt: now + 1,
    },
    {
      id: uid(),
      payer: '阿强',
      amountCents: 2400,
      participants: ['小明', '小红', '阿强'],
      note: '买水',
      createdAt: now + 2,
    },
  ];
}

const inputCls =
  'w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-base outline-none focus:border-green-600 focus:ring-2 focus:ring-green-100';
const btnPrimary =
  'w-full rounded-lg bg-green-700 px-4 py-3 text-base font-semibold text-white active:bg-green-800';
const btnGhost =
  'rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 active:bg-gray-100';

export default function App() {
  const [initial] = useState<SavedState>(loadState);
  const [people, setPeople] = useState<string[]>(initial.people);
  const [expenses, setExpenses] = useState<Expense[]>(initial.expenses);
  const [newPerson, setNewPerson] = useState('');
  const [personHint, setPersonHint] = useState('');
  const [payer, setPayer] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [formError, setFormError] = useState('');
  const [billUrl, setBillUrl] = useState<string | null>(null);
  const [copyState, setCopyState] = useState('');

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ people, expenses }));
    } catch {
      // Storage full or unavailable: the app still works for this session.
    }
  }, [people, expenses]);

  useEffect(() => {
    setBillUrl(null);
  }, [expenses]);

  const totalCents = useMemo(
    () => expenses.reduce((sum, e) => sum + e.amountCents, 0),
    [expenses],
  );

  const settlement: SettleResult | null = useMemo(() => {
    if (expenses.length === 0) return null;
    try {
      return settle(computeBalances(expenses));
    } catch {
      return null;
    }
  }, [expenses]);

  function addPerson() {
    const name = newPerson.trim();
    setPersonHint('');
    if (name === '') return;
    if (people.includes(name)) {
      setPersonHint('这个人已经加过了');
      return;
    }
    setPeople([...people, name]);
    setNewPerson('');
    if (payer === '') setPayer(name);
    setSelected((prev) => [...prev, name]);
  }

  function removePerson(name: string) {
    const used = expenses.some(
      (e) => e.payer === name || e.participants.includes(name),
    );
    if (used) {
      setPersonHint('这个人已经有消费记录，先删掉相关消费再移除');
      return;
    }
    setPeople(people.filter((p) => p !== name));
    setSelected(selected.filter((p) => p !== name));
    if (payer === name) setPayer('');
    setPersonHint('');
  }

  function toggleParticipant(name: string) {
    setSelected((prev) =>
      prev.includes(name) ? prev.filter((p) => p !== name) : [...prev, name],
    );
  }

  function addExpense() {
    setFormError('');
    const cents = parseYuanToCents(amount);
    if (people.length < 2) {
      setFormError('先加至少两个人');
      return;
    }
    if (payer === '' || !people.includes(payer)) {
      setFormError('请选择是谁付的钱');
      return;
    }
    if (cents === null) {
      setFormError('请输入正确的金额，例如 128.50');
      return;
    }
    if (selected.length === 0) {
      setFormError('请至少选一个分摊人');
      return;
    }
    setExpenses([
      ...expenses,
      {
        id: uid(),
        payer,
        amountCents: cents,
        participants: [...selected],
        note: note.trim(),
        createdAt: Date.now(),
      },
    ]);
    setAmount('');
    setNote('');
  }

  function loadSample() {
    setPeople(SAMPLE_PEOPLE);
    setExpenses(sampleExpenses());
    setPayer('小明');
    setSelected([...SAMPLE_PEOPLE]);
    setFormError('');
  }

  function clearAll() {
    setPeople([]);
    setExpenses([]);
    setPayer('');
    setAmount('');
    setNote('');
    setSelected([]);
    setFormError('');
    setBillUrl(null);
  }

  function generateBill() {
    if (!settlement) return;
    const data: BillData = {
      title: 'AA 分账',
      dateLabel: new Date().toLocaleDateString('zh-CN'),
      expenses: expenses.map((e) => ({
        note: e.note,
        payer: e.payer,
        amountCents: e.amountCents,
        participantCount: e.participants.length,
      })),
      transfers: settlement.transfers,
      totalCents,
    };
    setBillUrl(renderBillImage(data));
  }

  async function copySettlementText() {
    if (!settlement || settlement.transfers.length === 0) return;
    const lines = [
      'AA 分账结果',
      ...settlement.transfers.map(
        (t) => `${t.from} 转给 ${t.to} ${formatCents(t.amountCents)}`,
      ),
      `共 ${settlement.transfers.length} 笔转账`,
    ];
    const text = lines.join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopyState('已复制');
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopyState('已复制');
    }
    window.setTimeout(() => setCopyState(''), 2000);
  }

  return (
    <div className="mx-auto min-h-screen w-full max-w-xl px-4 pb-16">
      <header className="pb-2 pt-8">
        <h1 className="text-2xl font-bold">AA 分账计算器</h1>
        <p className="mt-1 text-sm text-gray-600">
          多人多笔消费，一键算出谁给谁转多少，转账笔数最少。
        </p>
      </header>

      <section className="mt-6 rounded-xl bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold">成员</h2>
        <div className="mt-3 flex gap-2">
          <input
            className={inputCls}
            value={newPerson}
            onChange={(e) => setNewPerson(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addPerson();
            }}
            placeholder="输入名字，例如 小明"
            maxLength={12}
          />
          <button type="button" className={btnGhost} onClick={addPerson}>
            添加
          </button>
        </div>
        {personHint !== '' && (
          <p className="mt-2 text-sm text-amber-700">{personHint}</p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          {people.map((person) => (
            <span
              key={person}
              className="inline-flex items-center gap-1 rounded-full bg-green-50 px-3 py-1.5 text-sm font-medium text-green-800"
            >
              {person}
              <button
                type="button"
                aria-label={`移除 ${person}`}
                className="text-green-600"
                onClick={() => removePerson(person)}
              >
                ×
              </button>
            </span>
          ))}
          {people.length === 0 && (
            <p className="text-sm text-gray-500">
              还没有成员，先加人，或点下面的示例数据看看效果。
            </p>
          )}
        </div>
      </section>

      <section className="mt-4 rounded-xl bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold">记一笔</h2>
        <label className="mt-3 block text-sm text-gray-600">
          谁付的钱
          <select
            className={`${inputCls} mt-1`}
            value={payer}
            onChange={(e) => setPayer(e.target.value)}
          >
            <option value="">请选择</option>
            {people.map((person) => (
              <option key={person} value={person}>
                {person}
              </option>
            ))}
          </select>
        </label>
        <label className="mt-3 block text-sm text-gray-600">
          金额（元）
          <input
            className={`${inputCls} mt-1`}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder="例如 128.50"
          />
        </label>
        <label className="mt-3 block text-sm text-gray-600">
          备注（可选）
          <input
            className={`${inputCls} mt-1`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="例如 火锅、打车、门票"
            maxLength={20}
          />
        </label>
        <div className="mt-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">分摊人</span>
            <button
              type="button"
              className="text-sm text-green-700"
              onClick={() =>
                setSelected(
                  selected.length === people.length ? [] : [...people],
                )
              }
            >
              {selected.length === people.length ? '全不选' : '全选'}
            </button>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {people.map((person) => (
              <button
                key={person}
                type="button"
                onClick={() => toggleParticipant(person)}
                className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                  selected.includes(person)
                    ? 'bg-green-700 text-white'
                    : 'bg-gray-100 text-gray-700'
                }`}
              >
                {person}
              </button>
            ))}
            {people.length === 0 && (
              <p className="text-sm text-gray-500">先在上面添加成员。</p>
            )}
          </div>
        </div>
        {formError !== '' && (
          <p className="mt-3 text-sm text-red-600">{formError}</p>
        )}
        <button type="button" className={`${btnPrimary} mt-4`} onClick={addExpense}>
          记下这笔
        </button>
      </section>

      <section className="mt-4 rounded-xl bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">消费记录</h2>
          <span className="text-sm text-gray-600">
            合计 {formatCents(totalCents)} · {expenses.length} 笔
          </span>
        </div>
        <ul className="mt-3 space-y-2">
          {expenses.map((e) => (
            <li
              key={e.id}
              className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2.5"
            >
              <div>
                <p className="text-sm font-medium">{e.note || '消费'}</p>
                <p className="text-xs text-gray-500">
                  {e.payer} 付 · {e.participants.length} 人分摊
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold">
                  {formatCents(e.amountCents)}
                </span>
                <button
                  type="button"
                  aria-label="删除这笔消费"
                  className="text-gray-400"
                  onClick={() =>
                    setExpenses(expenses.filter((x) => x.id !== e.id))
                  }
                >
                  ×
                </button>
              </div>
            </li>
          ))}
          {expenses.length === 0 && (
            <li className="text-sm text-gray-500">还没有消费记录。</li>
          )}
        </ul>
      </section>

      {settlement !== null && (
        <section className="mt-4 rounded-xl bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">转账方案</h2>
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                settlement.optimal
                  ? 'bg-green-50 text-green-800'
                  : 'bg-amber-50 text-amber-800'
              }`}
            >
              {settlement.optimal ? '已证明笔数最少' : '快速方案'}
            </span>
          </div>
          {settlement.transfers.length === 0 ? (
            <p className="mt-3 text-sm text-gray-600">
              大家已经扯平，不用转账。
            </p>
          ) : (
            <>
              <p className="mt-2 text-sm text-gray-600">
                最少 {settlement.transfers.length} 笔转账就能结清：
              </p>
              <ul className="mt-3 space-y-2">
                {settlement.transfers.map((t, i) => (
                  <li
                    key={`${t.from}-${t.to}-${i}`}
                    className="flex items-center justify-between rounded-lg bg-green-50 px-3 py-2.5"
                  >
                    <span className="text-sm font-medium">
                      {t.from} 转给 {t.to}
                    </span>
                    <span className="text-sm font-semibold">
                      {formatCents(t.amountCents)}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  className={btnGhost}
                  onClick={copySettlementText}
                >
                  复制转账文字 {copyState}
                </button>
                <button
                  type="button"
                  className={btnGhost}
                  onClick={generateBill}
                >
                  生成账单图
                </button>
              </div>
            </>
          )}
          {billUrl !== null && (
            <div className="mt-4">
              <img
                src={billUrl}
                alt="AA 分账账单图"
                className="w-full rounded-lg border border-gray-200"
              />
              <a
                href={billUrl}
                download="aa-bill.png"
                className="mt-3 block rounded-lg bg-green-700 px-4 py-3 text-center text-base font-semibold text-white"
              >
                保存账单图
              </a>
              <p className="mt-2 text-xs text-gray-500">
                长按图片也可以保存，分享到微信群即可。
              </p>
            </div>
          )}
        </section>
      )}

      <section className="mt-4 flex gap-2">
        <button type="button" className={btnGhost} onClick={loadSample}>
          填入示例数据
        </button>
        <button type="button" className={btnGhost} onClick={clearAll}>
          清空全部
        </button>
      </section>

      <footer className="mt-6 text-center text-xs leading-relaxed text-gray-500">
        数据只保存在本机浏览器，不上传服务器。转账方案由确定性算法算出，
        全程不用大模型。金额按整数分计算，不会丢一分钱。
      </footer>
    </div>
  );
}
