import { useState, useEffect, useCallback } from 'react'

/**
 * A React hook that provides persistent state using localStorage.
 * This replaces the @github/spark/hooks useKV hook.
 * 
 * @param key - The localStorage key to store the value under
 * @param initialValue - The initial value if none exists in localStorage
 * @returns A tuple of [value, setValue] similar to useState
 */
export function useLocalStorage<T>(
  key: string,
  initialValue: T
): [T, (valueOrUpdater: T | ((current: T) => T)) => void] {
  // Get the stored value or use initial value
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = localStorage.getItem(key)
      return item ? JSON.parse(item) : initialValue
    } catch (error) {
      console.error(`Error reading localStorage key "${key}":`, error)
      return initialValue
    }
  })

  // Update localStorage when storedValue changes
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(storedValue))
    } catch (error) {
      console.error(`Error setting localStorage key "${key}":`, error)
    }
  }, [key, storedValue])

  // Wrapped setValue that supports functional updates
  const setValue = useCallback((valueOrUpdater: T | ((current: T) => T)) => {
    setStoredValue((current) => {
      const newValue = typeof valueOrUpdater === 'function'
        ? (valueOrUpdater as (current: T) => T)(current)
        : valueOrUpdater
      return newValue
    })
  }, [])

  return [storedValue, setValue]
}

/**
 * Utility functions for direct localStorage access
 * This replaces window.spark.kv methods
 */
export const kvStorage = {
  async get<T>(key: string): Promise<T | null> {
    try {
      const item = localStorage.getItem(key)
      return item ? JSON.parse(item) : null
    } catch (error) {
      console.error(`Error reading localStorage key "${key}":`, error)
      return null
    }
  },

  async set<T>(key: string, value: T): Promise<void> {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch (error) {
      console.error(`Error setting localStorage key "${key}":`, error)
    }
  },

  async delete(key: string): Promise<void> {
    try {
      localStorage.removeItem(key)
    } catch (error) {
      console.error(`Error deleting localStorage key "${key}":`, error)
    }
  }
}
