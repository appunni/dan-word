import './style.css'
import { wordList, type Word } from './words'

const WEIGHTS_KEY = 'danword:wrongCounts'
const RECENT_HISTORY_LIMIT = 20

const revealedWordEl = document.querySelector<HTMLSpanElement>('#revealedWord')!
const wordBtn = document.querySelector<HTMLButtonElement>('#wordBtn')!
const nextBtn = document.querySelector<HTMLButtonElement>('#nextBtn')!
const optionButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.option-btn'))
const unsupportedNotice = document.querySelector<HTMLParagraphElement>('#unsupportedNotice')!

const supportsSpeech = 'speechSynthesis' in window

let weights = loadWeights()
let danishVoice: SpeechSynthesisVoice | undefined
let currentWord: Word = wordList[0]
let answered = false
const recentHistory: string[] = []

function loadWeights(): Record<string, number> {
  try {
    const raw = localStorage.getItem(WEIGHTS_KEY)
    return raw ? (JSON.parse(raw) as Record<string, number>) : {}
  } catch {
    return {}
  }
}

function saveWeights(): void {
  try {
    localStorage.setItem(WEIGHTS_KEY, JSON.stringify(weights))
  } catch {
    // ignore write errors (e.g. private browsing, storage full)
  }
}

function shuffle<T>(items: T[]): T[] {
  return [...items].sort(() => Math.random() - 0.5)
}

function pickWeightedWord(): Word {
  const excluded = new Set(recentHistory)
  const candidates = wordList.filter((word) => !excluded.has(word.da))
  const pool = candidates.length > 0 ? candidates : wordList

  const weighted = pool.map((word) => ({ word, weight: 1 + (weights[word.da] ?? 0) * 2 }))
  const total = weighted.reduce((sum, item) => sum + item.weight, 0)

  let roll = Math.random() * total
  for (const item of weighted) {
    roll -= item.weight
    if (roll <= 0) return item.word
  }
  return pool[pool.length - 1]
}

function rememberWord(word: Word): void {
  recentHistory.push(word.da)
  if (recentHistory.length > RECENT_HISTORY_LIMIT) recentHistory.shift()
}

function pickDistractors(correct: Word, count: number): Word[] {
  const usedTranslations = new Set([correct.en])
  const distractors: Word[] = []

  for (const word of shuffle(wordList)) {
    if (distractors.length >= count) break
    if (word.da === correct.da || usedTranslations.has(word.en)) continue
    usedTranslations.add(word.en)
    distractors.push(word)
  }
  return distractors
}

function loadVoices(): void {
  if (!supportsSpeech) return
  const voices = window.speechSynthesis.getVoices()
  const danishVoices = voices.filter((voice) => voice.lang === 'da-DK' || voice.lang.startsWith('da'))
  const exact = danishVoices.filter((voice) => voice.lang === 'da-DK')
  const prefixed = danishVoices.filter((voice) => voice.lang !== 'da-DK')
  // Prefer network-backed voices (typically higher quality, e.g. Google's) over
  // local/offline ones when a language has both, falling back to whatever's available.
  const pickBest = (list: SpeechSynthesisVoice[]) => list.find((voice) => !voice.localService) ?? list[0]
  danishVoice = pickBest(exact) ?? pickBest(prefixed)
}

function speak(text: string): void {
  if (!supportsSpeech) return
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = 'da-DK'
  utterance.rate = 0.82
  if (danishVoice) utterance.voice = danishVoice
  utterance.onstart = () => wordBtn.classList.add('speaking')
  utterance.onend = () => wordBtn.classList.remove('speaking')
  utterance.onerror = () => wordBtn.classList.remove('speaking')
  window.speechSynthesis.speak(utterance)
}

function startRound(): void {
  answered = false
  currentWord = pickWeightedWord()
  rememberWord(currentWord)
  const options = shuffle([currentWord, ...pickDistractors(currentWord, 3)])

  revealedWordEl.textContent = ''
  wordBtn.classList.remove('revealed', 'correct', 'incorrect')
  nextBtn.disabled = true

  optionButtons.forEach((btn, i) => {
    const option = options[i]
    btn.textContent = option.en
    btn.dataset.en = option.en
    btn.disabled = false
    btn.classList.remove('correct', 'incorrect', 'dimmed')
  })

  speak(currentWord.da)
}

function handleAnswer(selected: HTMLButtonElement): void {
  if (answered) return
  answered = true

  const isCorrect = selected.dataset.en === currentWord.en
  weights[currentWord.da] = isCorrect
    ? Math.max(0, (weights[currentWord.da] ?? 0) - 1)
    : (weights[currentWord.da] ?? 0) + 1
  saveWeights()

  optionButtons.forEach((btn) => {
    btn.disabled = true
    if (btn.dataset.en === currentWord.en) {
      btn.classList.add('correct')
    } else if (btn === selected) {
      btn.classList.add('incorrect')
    } else {
      btn.classList.add('dimmed')
    }
  })

  revealedWordEl.textContent = currentWord.da
  wordBtn.classList.add('revealed', isCorrect ? 'correct' : 'incorrect')
  nextBtn.disabled = false
  speak(currentWord.da)
}

loadVoices()
if (supportsSpeech) {
  window.speechSynthesis.addEventListener('voiceschanged', loadVoices)
} else {
  unsupportedNotice.hidden = false
}

optionButtons.forEach((btn) => {
  btn.addEventListener('click', () => handleAnswer(btn))
})
wordBtn.addEventListener('click', () => speak(currentWord.da))
nextBtn.addEventListener('click', () => startRound())

startRound()
