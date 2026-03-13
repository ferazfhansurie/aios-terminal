import { useState } from 'react'
import type { OnboardingData } from '../types'
import logo from '../assets/logo.png'

const TOTAL_STEPS = 7

const ROLES = ['Founder', 'CEO', 'Marketing Director', 'Sales Manager', 'Operations', 'Developer', 'Other']
const INDUSTRIES = ['Agency', 'E-commerce', 'SaaS', 'Services', 'Real Estate', 'F&B', 'Healthcare', 'Education', 'Manufacturing', 'Other']
const CURRENCIES = [
  { label: 'RM (MYR)', value: 'MYR' },
  { label: '$ (USD)', value: 'USD' },
  { label: 'S$ (SGD)', value: 'SGD' },
  { label: '\u20B1 (PHP)', value: 'PHP' },
  { label: '\u0E3F (THB)', value: 'THB' },
  { label: 'Rp (IDR)', value: 'IDR' },
]
const CLIENT_STATUSES = ['Active', 'Prospect', 'Churned']
const TOOL_OPTIONS = [
  'WhatsApp', 'Meta Ads', 'Google Ads', 'Shopee', 'Lazada', 'TikTok Shop',
  'Xero', 'QuickBooks', 'Notion', 'Slack', 'HubSpot', 'Mailchimp',
  'Stripe', 'Google Analytics', 'Custom CRM',
]

const INPUT_CLS = 'w-full px-4 py-3 rounded-xl bg-[#141416] border border-white/[0.06] text-neutral-100 text-sm placeholder:text-neutral-600 focus:outline-none accent-ring'
const BTN_PRIMARY = 'w-full py-3.5 rounded-xl accent-bg text-white font-semibold text-sm hover:brightness-110 transition-all accent-shadow active:scale-[0.98] disabled:opacity-50'
const BTN_SKIP = 'text-sm text-neutral-500 hover:text-neutral-300 transition-colors'
const CARD_CLS = 'bg-[#141416] border border-white/[0.06] rounded-xl p-4'

function emptyProduct() { return { name: '', price: '', description: '' } }
function emptyMember() { return { name: '', role: '' } }
function emptyClient() { return { name: '', revenue: '', status: 'Active' } }

export default function SetupWizard({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(1)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Form state
  const [data, setData] = useState<OnboardingData>({
    name: '',
    role: ROLES[0],
    businessName: '',
    businessDescription: '',
    market: '',
    industry: INDUSTRIES[0],
    currency: CURRENCIES[0].value,
    products: [emptyProduct()],
    team: [emptyMember()],
    clients: [emptyClient()],
    tools: [],
  })

  const [justMe, setJustMe] = useState(false)
  const [noClients, setNoClients] = useState(false)

  const update = <K extends keyof OnboardingData>(key: K, value: OnboardingData[K]) => {
    setData((prev) => ({ ...prev, [key]: value }))
  }

  const next = () => { setError(''); setStep((s) => Math.min(s + 1, TOTAL_STEPS)) }
  const back = () => { setError(''); setStep((s) => Math.max(s - 1, 1)) }

  const handleLaunch = async () => {
    setSaving(true)
    setError('')
    try {
      const aios = (window as any).aios
      const payload: OnboardingData = {
        ...data,
        products: data.products.filter((p) => p.name.trim()),
        team: justMe ? [] : data.team.filter((m) => m.name.trim()),
        clients: noClients ? [] : data.clients.filter((c) => c.name.trim()),
      }
      const result = await aios.saveSetupData(payload)
      if (result?.success) {
        onComplete()
      } else {
        setError('Failed to save setup data. Please try again.')
      }
    } catch (err: any) {
      setError(err?.message || 'Something went wrong.')
    } finally {
      setSaving(false)
    }
  }

  // ── Step indicator ──

  const StepIndicator = () => (
    <div className="flex items-center justify-center gap-2 mb-8 pt-8">
      {Array.from({ length: TOTAL_STEPS }, (_, i) => {
        const s = i + 1
        const isActive = s === step
        const isDone = s < step
        return (
          <div
            key={s}
            className={`h-2 rounded-full transition-all duration-300 ${
              isActive ? 'w-8 accent-bg' : isDone ? 'w-2 accent-bg opacity-50' : 'w-2 bg-white/[0.08]'
            }`}
          />
        )
      })}
    </div>
  )

  // ── Step header ──

  const StepHeader = ({ title, subtitle }: { title: string; subtitle?: string }) => (
    <div className="mb-6">
      <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-1">
        Step {step} of {TOTAL_STEPS}
      </p>
      <h2 className="text-xl font-semibold text-neutral-100">{title}</h2>
      {subtitle && <p className="text-sm text-neutral-500 mt-1">{subtitle}</p>}
    </div>
  )

  // ── Navigation buttons ──

  const NavButtons = ({ onNext, nextLabel, nextDisabled, showSkip, onSkip }: {
    onNext: () => void
    nextLabel?: string
    nextDisabled?: boolean
    showSkip?: boolean
    onSkip?: () => void
  }) => (
    <div className="mt-8 space-y-3">
      <button
        onClick={onNext}
        disabled={nextDisabled}
        className={BTN_PRIMARY}
      >
        {nextLabel || 'Next'}
      </button>
      <div className="flex items-center justify-between">
        {step > 1 ? (
          <button onClick={back} className={BTN_SKIP}>Back</button>
        ) : <span />}
        {showSkip && (
          <button onClick={onSkip || next} className={BTN_SKIP}>Skip</button>
        )}
      </div>
    </div>
  )

  // ── Remove button ──

  const RemoveBtn = ({ onClick }: { onClick: () => void }) => (
    <button
      onClick={onClick}
      className="text-red-400 hover:text-red-300 text-xs px-1.5 py-1 rounded transition-colors shrink-0"
      title="Remove"
    >
      X
    </button>
  )

  // ── Step 1: Welcome ──

  const renderWelcome = () => (
    <div className="text-center">
      <img src={logo} alt="AIOS" className="w-16 h-16 mx-auto mb-6 accent-glow" />
      <h1 className="text-2xl font-bold text-neutral-100 tracking-tight mb-2">Welcome to AIOS</h1>
      <p className="text-sm text-neutral-500 mb-8">Let's set up your AI co-founder</p>

      <div className="space-y-3 text-left">
        <input
          type="text"
          value={data.name}
          onChange={(e) => update('name', e.target.value)}
          placeholder="Your name"
          className={INPUT_CLS + ' text-center text-base'}
          autoFocus
        />
        <select
          value={data.role}
          onChange={(e) => update('role', e.target.value)}
          className={INPUT_CLS}
        >
          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>

      <NavButtons
        onNext={next}
        nextDisabled={!data.name.trim()}
      />

      <button
        onClick={() => {
          localStorage.removeItem('aios-config')
          window.location.reload()
        }}
        className="mt-4 text-xs text-neutral-600 hover:text-neutral-400 transition-colors"
      >
        Go to login
      </button>
    </div>
  )

  // ── Step 2: Business ──

  const renderBusiness = () => (
    <div>
      <StepHeader title="Your Business" subtitle="Tell your AI about what you do" />
      <div className="space-y-3">
        <input
          type="text"
          value={data.businessName}
          onChange={(e) => update('businessName', e.target.value)}
          placeholder="Business name"
          className={INPUT_CLS}
          autoFocus
        />
        <textarea
          value={data.businessDescription}
          onChange={(e) => update('businessDescription', e.target.value)}
          placeholder="What does your business do?"
          rows={3}
          className={INPUT_CLS + ' resize-none'}
        />
        <input
          type="text"
          value={data.market}
          onChange={(e) => update('market', e.target.value)}
          placeholder="Market / Location (e.g. Malaysia, Southeast Asia)"
          className={INPUT_CLS}
        />
        <select
          value={data.industry}
          onChange={(e) => update('industry', e.target.value)}
          className={INPUT_CLS}
        >
          {INDUSTRIES.map((i) => <option key={i} value={i}>{i}</option>)}
        </select>
        <select
          value={data.currency}
          onChange={(e) => update('currency', e.target.value)}
          className={INPUT_CLS}
        >
          {CURRENCIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </div>
      <NavButtons
        onNext={next}
        nextDisabled={!data.businessName.trim()}
      />
    </div>
  )

  // ── Step 3: Products ──

  const renderProducts = () => {
    const products = data.products
    const addProduct = () => update('products', [...products, emptyProduct()])
    const removeProduct = (idx: number) => update('products', products.filter((_, i) => i !== idx))
    const updateProduct = (idx: number, field: string, value: string) => {
      const updated = products.map((p, i) => i === idx ? { ...p, [field]: value } : p)
      update('products', updated)
    }

    return (
      <div>
        <StepHeader title="Products & Pricing" subtitle="What do you sell?" />
        <div className="space-y-3">
          {products.map((p, idx) => (
            <div key={idx} className={CARD_CLS}>
              <div className="flex items-start gap-2">
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={p.name}
                      onChange={(e) => updateProduct(idx, 'name', e.target.value)}
                      placeholder="Product name"
                      className={INPUT_CLS}
                    />
                    <input
                      type="text"
                      value={p.price}
                      onChange={(e) => updateProduct(idx, 'price', e.target.value)}
                      placeholder="Price"
                      className={INPUT_CLS + ' max-w-[120px]'}
                    />
                  </div>
                  <input
                    type="text"
                    value={p.description}
                    onChange={(e) => updateProduct(idx, 'description', e.target.value)}
                    placeholder="Brief description (optional)"
                    className={INPUT_CLS}
                  />
                </div>
                {products.length > 1 && <RemoveBtn onClick={() => removeProduct(idx)} />}
              </div>
            </div>
          ))}
        </div>
        <button onClick={addProduct} className="mt-3 text-sm accent-text hover:brightness-110 transition-colors">
          + Add product
        </button>
        <NavButtons onNext={next} showSkip />
      </div>
    )
  }

  // ── Step 4: Team ──

  const renderTeam = () => {
    const team = data.team
    const addMember = () => update('team', [...team, emptyMember()])
    const removeMember = (idx: number) => update('team', team.filter((_, i) => i !== idx))
    const updateMember = (idx: number, field: string, value: string) => {
      const updated = team.map((m, i) => i === idx ? { ...m, [field]: value } : m)
      update('team', updated)
    }

    return (
      <div>
        <StepHeader title="Your Team" subtitle="Who else is involved?" />

        <button
          onClick={() => setJustMe(!justMe)}
          className={`${CARD_CLS} w-full text-left mb-4 transition-all ${justMe ? 'accent-border-30' : ''}`}
        >
          <div className="flex items-center gap-3">
            <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${
              justMe ? 'accent-bg accent-border-50' : 'border-white/[0.12]'
            }`}>
              {justMe && (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M2.5 6L5 8.5L9.5 3.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>
            <span className="text-sm text-neutral-200">Just me</span>
          </div>
        </button>

        {!justMe && (
          <>
            <div className="space-y-3">
              {team.map((m, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={m.name}
                    onChange={(e) => updateMember(idx, 'name', e.target.value)}
                    placeholder="Name"
                    className={INPUT_CLS}
                  />
                  <input
                    type="text"
                    value={m.role}
                    onChange={(e) => updateMember(idx, 'role', e.target.value)}
                    placeholder="Role"
                    className={INPUT_CLS}
                  />
                  {team.length > 1 && <RemoveBtn onClick={() => removeMember(idx)} />}
                </div>
              ))}
            </div>
            <button onClick={addMember} className="mt-3 text-sm accent-text hover:brightness-110 transition-colors">
              + Add member
            </button>
          </>
        )}

        <NavButtons onNext={next} showSkip />
      </div>
    )
  }

  // ── Step 5: Clients ──

  const renderClients = () => {
    const clients = data.clients
    const addClient = () => update('clients', [...clients, emptyClient()])
    const removeClient = (idx: number) => update('clients', clients.filter((_, i) => i !== idx))
    const updateClient = (idx: number, field: string, value: string) => {
      const updated = clients.map((c, i) => i === idx ? { ...c, [field]: value } : c)
      update('clients', updated)
    }

    return (
      <div>
        <StepHeader title="Clients" subtitle="Who are your current clients?" />

        <button
          onClick={() => setNoClients(!noClients)}
          className={`${CARD_CLS} w-full text-left mb-4 transition-all ${noClients ? 'accent-border-30' : ''}`}
        >
          <div className="flex items-center gap-3">
            <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${
              noClients ? 'accent-bg accent-border-50' : 'border-white/[0.12]'
            }`}>
              {noClients && (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M2.5 6L5 8.5L9.5 3.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>
            <span className="text-sm text-neutral-200">No clients yet</span>
          </div>
        </button>

        {!noClients && (
          <>
            <div className="space-y-3">
              {clients.map((c, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={c.name}
                    onChange={(e) => updateClient(idx, 'name', e.target.value)}
                    placeholder="Client name"
                    className={INPUT_CLS}
                  />
                  <input
                    type="text"
                    value={c.revenue}
                    onChange={(e) => updateClient(idx, 'revenue', e.target.value)}
                    placeholder="Monthly revenue"
                    className={INPUT_CLS + ' max-w-[140px]'}
                  />
                  <select
                    value={c.status}
                    onChange={(e) => updateClient(idx, 'status', e.target.value)}
                    className={INPUT_CLS + ' max-w-[120px]'}
                  >
                    {CLIENT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                  {clients.length > 1 && <RemoveBtn onClick={() => removeClient(idx)} />}
                </div>
              ))}
            </div>
            <button onClick={addClient} className="mt-3 text-sm accent-text hover:brightness-110 transition-colors">
              + Add client
            </button>
          </>
        )}

        <NavButtons onNext={next} showSkip />
      </div>
    )
  }

  // ── Step 6: Tools ──

  const renderTools = () => {
    const toggle = (tool: string) => {
      const tools = data.tools.includes(tool)
        ? data.tools.filter((t) => t !== tool)
        : [...data.tools, tool]
      update('tools', tools)
    }

    return (
      <div>
        <StepHeader title="Tools You Use" subtitle="Select the platforms you work with" />
        <div className="grid grid-cols-3 gap-2">
          {TOOL_OPTIONS.map((tool) => {
            const selected = data.tools.includes(tool)
            return (
              <button
                key={tool}
                onClick={() => toggle(tool)}
                className={`px-3 py-2.5 rounded-xl border text-sm text-left transition-all ${
                  selected
                    ? 'accent-bg-15 accent-border-30 accent-text'
                    : 'bg-[#141416] border-white/[0.06] text-neutral-400 hover:text-neutral-200 hover:border-white/[0.12]'
                }`}
              >
                {tool}
              </button>
            )
          })}
        </div>
        <NavButtons onNext={next} showSkip />
      </div>
    )
  }

  // ── Step 7: Review ──

  const renderReview = () => {
    const filteredProducts = data.products.filter((p) => p.name.trim())
    const filteredTeam = justMe ? [] : data.team.filter((m) => m.name.trim())
    const filteredClients = noClients ? [] : data.clients.filter((c) => c.name.trim())
    const currencyLabel = CURRENCIES.find((c) => c.value === data.currency)?.label || data.currency

    return (
      <div>
        <StepHeader title="Review & Launch" subtitle="Here's your business snapshot" />

        <div className={CARD_CLS + ' space-y-4'}>
          {/* Identity */}
          <div>
            <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-1">You</p>
            <p className="text-sm text-neutral-200">{data.name} -- {data.role}</p>
          </div>

          {/* Business */}
          <div>
            <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-1">Business</p>
            <p className="text-sm text-neutral-200 font-medium">{data.businessName}</p>
            {data.businessDescription && (
              <p className="text-sm text-neutral-400 mt-0.5">{data.businessDescription}</p>
            )}
            <div className="flex items-center gap-3 mt-1">
              {data.market && <span className="text-xs text-neutral-500">{data.market}</span>}
              <span className="text-xs text-neutral-500">{data.industry}</span>
              <span className="text-xs text-neutral-500">{currencyLabel}</span>
            </div>
          </div>

          {/* Products */}
          {filteredProducts.length > 0 && (
            <div>
              <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-1">
                Products ({filteredProducts.length})
              </p>
              <div className="space-y-1">
                {filteredProducts.map((p, i) => (
                  <p key={i} className="text-sm text-neutral-300">
                    {p.name}{p.price ? ` -- ${p.price}` : ''}
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* Team */}
          <div>
            <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-1">Team</p>
            {justMe || filteredTeam.length === 0 ? (
              <p className="text-sm text-neutral-400">Solo</p>
            ) : (
              <div className="space-y-1">
                {filteredTeam.map((m, i) => (
                  <p key={i} className="text-sm text-neutral-300">
                    {m.name}{m.role ? ` -- ${m.role}` : ''}
                  </p>
                ))}
              </div>
            )}
          </div>

          {/* Clients */}
          <div>
            <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-1">Clients</p>
            {noClients || filteredClients.length === 0 ? (
              <p className="text-sm text-neutral-400">None yet</p>
            ) : (
              <div className="space-y-1">
                {filteredClients.map((c, i) => (
                  <p key={i} className="text-sm text-neutral-300">
                    {c.name}{c.revenue ? ` -- ${c.revenue}/mo` : ''}{' '}
                    <span className="text-xs text-neutral-500">({c.status})</span>
                  </p>
                ))}
              </div>
            )}
          </div>

          {/* Tools */}
          {data.tools.length > 0 && (
            <div>
              <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-1">Tools</p>
              <p className="text-sm text-neutral-400">{data.tools.join(', ')}</p>
            </div>
          )}
        </div>

        {error && (
          <p className="text-xs text-red-400 mt-3 px-1">{error}</p>
        )}

        <div className="mt-8 space-y-3">
          <button
            onClick={handleLaunch}
            disabled={saving}
            className={BTN_PRIMARY}
          >
            {saving ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Saving...
              </span>
            ) : (
              'Launch AIOS'
            )}
          </button>
          <div className="flex items-center justify-between">
            <button onClick={back} className={BTN_SKIP}>Back</button>
          </div>
        </div>
      </div>
    )
  }

  // ── Render ──

  const renderStep = () => {
    switch (step) {
      case 1: return renderWelcome()
      case 2: return renderBusiness()
      case 3: return renderProducts()
      case 4: return renderTeam()
      case 5: return renderClients()
      case 6: return renderTools()
      case 7: return renderReview()
      default: return null
    }
  }

  return (
    <div className="h-screen bg-[#0a0a0c] text-neutral-100 overflow-y-auto">
      <div className="max-w-lg mx-auto px-6 pb-12">
        <StepIndicator />
        {renderStep()}
      </div>
    </div>
  )
}
