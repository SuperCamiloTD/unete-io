module.exports = {

    step: (cb) => {
        setInterval(() => {
            console.log("Fire!!");
            cb()
        }, 1000)
    }

}