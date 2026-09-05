import './style.css'
import { wordList, type Word } from './words'

const WEIGHTS_KEY = 'danword:wrongCounts'

const revealedWordEl = document.querySelector<HTMLParagraphElement>('#revealedWord')!
const replayBtn = document.querySelector<HTMLButtonElement>('#replayBtn')!
const nextBtn = document.querySelector<HTMLButtonElement>('#nextBtn')!
const optionButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.option-btn'))

let weights = loadWeights()
let danishVoice: SpeechSynthesisVoice | undefined
let currentWord: Word = wordList[0]
let answered = false

function loadWeights(): Record<string, number> {
  try {
    const raw = localStorage.getItem(WEIGHTS_KEY)
    return raw ? (JSON.parse(raw) as Record<string, number>) : {}
  } catch {
    return {}
  }
}

function saveWeights(): void {
  localStorage.setItem(WEIGHTS_KEY, JSON.stringify(weights))
}

function shuffle<T>(items: T[]): T[] {
  return [...items].sort(() => Math.random() - 0.5)
}

function pickWeightedWord(exclude?: Word): Word {
  const weighted = wordList.map((word) => ({ word, weight: 1 + (weights[word.da] ?? 0) * 2 }))
  const total = weighted.reduce((sum, item) => sum + item.weight, 0)

  for (let attempt = 0; attempt < 10; attempt++) {
    let roll = Math.random() * total
    for (const item of weighted) {
      roll -= item.weight
      if (roll <= 0) {
        if (!exclude || item.word.da !== exclude.da) return item.word
        break
      }
    }
  }
  return wordList[Math.floor(Math.random() * wordList.length)]
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
  const voices = window.speechSynthesis.getVoices()
  danishVoice = voices.find((voice) => voice.lang === 'da-DK') ?? voices.find((voice) => voice.lang.startsWith('da'))
}

function speak(text: string): void {
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = 'da-DK'
  if (danishVoice) utterance.voice = danishVoice
  utterance.onstart = () => replayBtn.classList.add('speaking')
  utterance.onend = () => replayBtn.classList.remove('speaking')
  window.speechSynthesis.speak(utterance)
}

function startRound(): void {
  answered = false
  currentWord = pickWeightedWord(currentWord)
  const options = shuffle([currentWord, ...pickDistractors(currentWord, 3)])

  revealedWordEl.textContent = ''
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
  nextBtn.disabled = false
  speak(currentWord.da)
}

loadVoices()
window.speechSynthesis.addEventListener('voiceschanged', loadVoices)

optionButtons.forEach((btn) => {
  btn.addEventListener('click', () => handleAnswer(btn))
})
replayBtn.addEventListener('click', () => speak(currentWord.da))
nextBtn.addEventListener('click', () => startRound())

startRound()
