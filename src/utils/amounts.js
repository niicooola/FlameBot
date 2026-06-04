function cleanAmount(value) {
    const n = parseInt(value);

    return Number.isFinite(n)
        ? n
        : null;
}

function cleanFloat(value) {
    const f = parseFloat(value);

    return Number.isFinite(f)
        ? f
        : null;
}

module.exports = {
    cleanAmount,
    cleanFloat
};
