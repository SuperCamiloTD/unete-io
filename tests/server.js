module.exports = {

    step: (cb) => {
        setInterval(() => {
            console.log("Fire!!");
            cb()
        }, 1000)
    },

    add: (a, b) => a + b

}