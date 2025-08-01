const path = require('path')
const webpack = require('webpack')
const TerserWebpackPlugin = require('terser-webpack-plugin')

const __getCurrentLocalTimeString = () => {
  const date = new Date()
  const options = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }
  return date.toLocaleString('zh-TW', options).replace(/(\d+)\/(\d+)\/(\d+) (\d+):(\d+):(\d+)/, '$1$2$3$4$5$6')
}

module.exports = (env, argv) => {
  const mode = argv.mode || 'none'
  const version = process?.env?.VERSION || (mode === 'none' ? `WIP-${__getCurrentLocalTimeString()}` : '0.0.0')

  const ENV_MAP = {
    none: { MODE: 'dev' },
    development: { MODE: 'test' },
    production: { MODE: 'prod' }
  }
  const MODE_ENV = ENV_MAP[mode]

  const config = {
    mode,
    entry: './src/answerFormatter.js',
    output: {
      filename: 'answerFormatter.js',
      path: path.resolve(__dirname, 'dist')
    },
    devtool: false,
    module: {
      rules: [
        {
          test: /\.js$/,
          exclude: /node_modules/,
          use: {
            loader: 'babel-loader',
            options: {
              presets: ['@babel/preset-env']
            }
          }
        }
      ]
    },
    optimization: {
      minimize: mode === 'production',
      minimizer: [new TerserWebpackPlugin()]
    },
    plugins: [
      new webpack.DefinePlugin({
        'process.env.VERSION': JSON.stringify(version),
        'process.env.MODE': JSON.stringify(MODE_ENV.MODE),
        'process.env.AWS_S3_BUCKET_TEST': JSON.stringify(process.env.AWS_S3_BUCKET_TEST),
        'process.env.AWS_S3_REGION_TEST': JSON.stringify(process.env.AWS_S3_REGION_TEST),
        'process.env.AWS_S3_BUCKET_PROD': JSON.stringify(process.env.AWS_S3_BUCKET_PROD),
        'process.env.AWS_S3_REGION_PROD': JSON.stringify(process.env.AWS_S3_REGION_PROD)
      })
    ]
  }

  return config
}
