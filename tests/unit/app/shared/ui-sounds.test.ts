import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SOUND_SETTINGS,
  classifySoundTarget,
  isActivationKey,
  parseSoundSettings,
  serializeSoundSettings,
} from '~/shared/lib/uiSounds';

describe('parseSoundSettings', () => {
  it('returns the defaults for a missing or malformed value', () => {
    expect(parseSoundSettings(null)).toEqual(DEFAULT_SOUND_SETTINGS);
    expect(parseSoundSettings('')).toEqual(DEFAULT_SOUND_SETTINGS);
    expect(parseSoundSettings('{')).toEqual(DEFAULT_SOUND_SETTINGS);
    expect(parseSoundSettings('null')).toEqual(DEFAULT_SOUND_SETTINGS);
    expect(parseSoundSettings('[]')).toEqual(DEFAULT_SOUND_SETTINGS);
  });

  it('reads a stored choice', () => {
    expect(parseSoundSettings('{"enabled":false,"volume":0.25}')).toEqual({ enabled: false, volume: 0.25 });
  });

  it('keeps each field independently when the other is invalid', () => {
    expect(parseSoundSettings('{"enabled":"yes","volume":0.4}')).toEqual({
      enabled: DEFAULT_SOUND_SETTINGS.enabled,
      volume: 0.4,
    });
    expect(parseSoundSettings('{"enabled":false,"volume":"loud"}')).toEqual({
      enabled: false,
      volume: DEFAULT_SOUND_SETTINGS.volume,
    });
  });

  it('clamps a finite volume and rejects a non-finite one', () => {
    expect(parseSoundSettings('{"volume":2}').volume).toBe(1);
    expect(parseSoundSettings('{"volume":-1}').volume).toBe(0);
    expect(parseSoundSettings('{"volume":1e999}').volume).toBe(DEFAULT_SOUND_SETTINGS.volume);
  });
});

describe('serializeSoundSettings', () => {
  it('round-trips through parse', () => {
    const settings = { enabled: false, volume: 0.35 };
    expect(parseSoundSettings(serializeSoundSettings(settings))).toEqual(settings);
  });

  it('normalizes the volume before storing it', () => {
    expect(parseSoundSettings(serializeSoundSettings({ enabled: true, volume: 5 })).volume).toBe(1);
  });
});

describe('classifySoundTarget', () => {
  it('ignores a missing target', () => {
    expect(classifySoundTarget(null)).toBeNull();
    expect(classifySoundTarget(undefined)).toBeNull();
  });

  it('ignores disabled controls', () => {
    expect(classifySoundTarget({ tagName: 'BUTTON', disabled: true })).toBeNull();
    expect(classifySoundTarget({ tagName: 'BUTTON', ariaDisabled: true })).toBeNull();
    expect(classifySoundTarget({ tagName: 'INPUT', type: 'checkbox', disabled: true })).toBeNull();
  });

  it('ignores muted regions', () => {
    expect(classifySoundTarget({ tagName: 'BUTTON', muted: true })).toBeNull();
  });

  it('gives buttons, links, tabs and menu items a tap', () => {
    expect(classifySoundTarget({ tagName: 'BUTTON' })).toBe('tap');
    expect(classifySoundTarget({ tagName: 'A' })).toBe('tap');
    expect(classifySoundTarget({ tagName: 'SUMMARY' })).toBe('tap');
    expect(classifySoundTarget({ tagName: 'SELECT' })).toBe('tap');
    expect(classifySoundTarget({ tagName: 'DIV', role: 'button' })).toBe('tap');
    expect(classifySoundTarget({ tagName: 'DIV', role: 'tab' })).toBe('tap');
    expect(classifySoundTarget({ tagName: 'DIV', role: 'menuitem' })).toBe('tap');
    expect(classifySoundTarget({ tagName: 'DIV', role: 'option' })).toBe('tap');
    expect(classifySoundTarget({ tagName: 'INPUT', type: 'submit' })).toBe('tap');
  });

  it('gives checkboxes, radios and switches a toggle', () => {
    expect(classifySoundTarget({ tagName: 'INPUT', type: 'checkbox' })).toBe('toggle');
    expect(classifySoundTarget({ tagName: 'INPUT', type: 'radio' })).toBe('toggle');
    expect(classifySoundTarget({ tagName: 'DIV', role: 'switch' })).toBe('toggle');
    expect(classifySoundTarget({ tagName: 'DIV', role: 'checkbox' })).toBe('toggle');
    expect(classifySoundTarget({ tagName: 'DIV', role: 'radio' })).toBe('toggle');
  });

  it('ignores text entry, sliders and plain content', () => {
    expect(classifySoundTarget({ tagName: 'INPUT', type: 'text' })).toBeNull();
    expect(classifySoundTarget({ tagName: 'INPUT', type: 'range' })).toBeNull();
    expect(classifySoundTarget({ tagName: 'INPUT' })).toBeNull();
    expect(classifySoundTarget({ tagName: 'TEXTAREA' })).toBeNull();
    expect(classifySoundTarget({ tagName: 'DIV' })).toBeNull();
    expect(classifySoundTarget({ tagName: 'SPAN', role: 'presentation' })).toBeNull();
  });

  it('matches tag and role case-insensitively', () => {
    expect(classifySoundTarget({ tagName: 'button' })).toBe('tap');
    expect(classifySoundTarget({ tagName: 'Input', type: 'Checkbox' })).toBe('toggle');
  });
});

describe('isActivationKey', () => {
  it('accepts Enter on buttons, links and toggles', () => {
    expect(isActivationKey({ key: 'Enter', tagName: 'BUTTON' })).toBe(true);
    expect(isActivationKey({ key: 'Enter', tagName: 'A' })).toBe(true);
    expect(isActivationKey({ key: 'Enter', tagName: 'INPUT', type: 'checkbox' })).toBe(true);
  });

  it('accepts Space on buttons and toggles but not on links', () => {
    expect(isActivationKey({ key: ' ', tagName: 'BUTTON' })).toBe(true);
    expect(isActivationKey({ key: 'Spacebar', tagName: 'BUTTON' })).toBe(true);
    expect(isActivationKey({ key: ' ', tagName: 'INPUT', type: 'checkbox' })).toBe(true);
    expect(isActivationKey({ key: ' ', tagName: 'A' })).toBe(false);
  });

  it('rejects other keys and disabled targets', () => {
    expect(isActivationKey({ key: 'a', tagName: 'BUTTON' })).toBe(false);
    expect(isActivationKey({ key: 'Enter', tagName: 'DIV' })).toBe(false);
    expect(isActivationKey({ key: 'Enter', tagName: 'BUTTON', disabled: true })).toBe(false);
    expect(isActivationKey({ key: 'Enter', tagName: 'TEXTAREA' })).toBe(false);
  });
});
