(function () {
    // A full native shield can stop WebView animation frames. Inspect the
    // committed React DOM instead of waiting for frames behind that shield.
    var resume = new Event('calculator-native-resume', {cancelable: true});
    if (window.dispatchEvent(resume) || document.hidden) return false;
    var locked = document.documentElement.dataset.calculatorLocked === 'true';
    var ready = document.querySelector(locked
        ? '.calculator-shell button'
        : '.calculator-private:not([hidden])');
    return !!ready && ready.getClientRects().length > 0;
})()
