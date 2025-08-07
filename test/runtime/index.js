const buildAnswerFormatter = require('answer-formatter')
// const buildAnswerFormatter = require('../../dist/answerFormatter.cjs.js')

const main = async () => {
  const answerFormatter = await buildAnswerFormatter()
  console.log(answerFormatter)
}

main()
