import { listeningDB } from '../db/listening.ts'
import { initializeListening } from './listening-recorder.ts'

export async function loadListeningReport() {
  await initializeListening()
  return listeningDB.read()
}
