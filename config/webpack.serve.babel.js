/**
 * webpack开发环境配置文件
 * @author Joe Zhong <zhong.zhi@163.com>
 * @module config/webpack.serve.babel
 */

import { existsSync } from 'fs';
import path from 'path';
import { isString, isArray, isObject, isFunction } from 'util';
import webpack from 'webpack';
import DashboardPlugin from 'webpack-dashboard/plugin';
import HtmlWebpackPlugin from 'packing-html-webpack-plugin';
import packingGlob from 'packing-glob';
import autoprefixer from 'autoprefixer';
import packing from './packing';

const {
  assetsDist,
  entries,
  templatesPages,
  mockPageInit,
} = packing.path;
const { templateExtension } = packing;
const cwd = process.cwd();

 /**
  * 给所有入口js加上HRM的clientjs
  * @param {string|array|object} entry 页面入口列表
  * @param {boolean} reload 是否强制刷新页面
  * @return {array}
  */
const pushClientJS = (entry, reload) => {
  let clientJS = 'webpack-hot-middleware/client';
  if (reload) {
    clientJS += '?reload=true';
  }
  let newEntry = entry;
  if (isString(newEntry)) {
    newEntry = [clientJS, newEntry];
  } else if (isArray(newEntry)) {
    newEntry.unshift(clientJS);
  } else if (isObject(newEntry)) {
    Object.keys(newEntry).forEach(key => {
      newEntry[key] = pushClientJS(newEntry[key], reload);
    });
  }
  return newEntry;
};

/**
 * 根据文件的目录结构生成entry配置
 * @return {object}
 */
const initConfig = () => {
  const jsExt = '.js';
  const entryConfig = {};
  const htmlWebpackPluginConfig = [];
  const globOptions = { cwd: path.resolve(cwd, templatesPages) };
  const pattern = isArray(templateExtension) && templateExtension.length > 1 ?
    `**/*{${templateExtension.join(',')}}` :
    `**/*${templateExtension}`;

  packingGlob(pattern, globOptions).forEach(page => {
    const ext = path.extname(page).toLowerCase();
    let key = page.replace(ext, '');
    // 写入页面级别的配置
    if (entryConfig[key]) {
      key += ext;
    }
    let value;
    if (isFunction(entries)) {
      value = entries(key);
    } else {
      value = path.resolve(cwd, entries.replace('{pagename}', key));
    }
    if (existsSync(value)) {
      entryConfig[key] = value;
    } else {
      console.log(`❗️ entry file not exist: ${value}`);
    }

    const templateInitData = path.resolve(mockPageInit, page.replace(ext, jsExt));
    const htmlFile = {
      filename: ext === '.html' ? page : `${page}.html`,
      template: path.resolve(templatesPages, page),
      cache: false,
      inject: false,
    };
    if (existsSync(templateInitData)) {
      htmlFile.templateInitData = templateInitData;
    }
    htmlWebpackPluginConfig.push(htmlFile);
  });

  return {
    entryConfig,
    htmlWebpackPluginConfig
  };
};

/**
 * 返回样式loader字符串
 * @param {string} cssPreprocessor css预处理器类型
 * @return {string}
 */
const styleLoaderString = (cssPreprocessor) => {
  const query = cssPreprocessor ? `!${cssPreprocessor}` : '';
  return `style!css?importLoaders=2!postcss${query}`;
};

/**
 * 生成webpack配置文件
 * @param {object} options 特征配置项
 * @return {object}
 */
const webpackConfig = (options) => {
  const { entryConfig, htmlWebpackPluginConfig } = initConfig();
  const projectRootPath = path.resolve(__dirname, '../');
  const assetsPath = path.resolve(projectRootPath, assetsDist);
  const chunkhash = options.longTermCaching ? '-[chunkhash:8]' : '';
  const progress = options.progress;
  const context = path.resolve(__dirname, '..');
  const devtool = options.devtool;

  let entry = entryConfig;

  const output = {
    chunkFilename: `[name]${chunkhash}.js`,
    filename: `[name]${chunkhash}.js`,
    // prd环境静态文件输出地址
    path: assetsPath,
    // dev环境下数据流访问地址
    publicPath: '',
    // publicPath: '/js/'
  };

  /* eslint-disable */
  let moduleConfig = {
    loaders: [
      { test: /\.js?$/, loaders: ['babel', 'eslint'], exclude: /node_modules/ },
      { test: /\.css$/, loader: styleLoaderString() },
      { test: /\.less$/, loader: styleLoaderString('less') },
      { test: /\.scss$/, loader: styleLoaderString('sass') },
      { test: /\.json$/, loader: 'json' },
      { test: /\.(jpg|png|gif|ttf|woff|woff2|eot|svg)$/, loader: 'url?name=[name]-[hash:8].[ext]&limit=10000' },
      { test: /\.(jade|pug)$/, loader: 'pug' },
      { test: /\.html$/, loader: 'html' },
      { test: /\.ejs$/, loader: 'ejs' },
      { test: /\.(tpl|smart)$/, loader: 'smarty' },
      { test: /\.handlebars$/, loader: 'handlebars' },
      { test: /\.mustache$/, loader: 'mustache' },
    ]
  };

  const postcss = () => [autoprefixer];

  const resolve = {
    alias: {
      'env-alias': path.resolve(__dirname, '../src/config/env', process.env.NODE_ENV)
    },
    modulesDirectories: [ 'src', 'node_modules' ],
    extensions: ['', '.json', '.js', '.jsx']
  };

  const plugins = htmlWebpackPluginConfig.map((item) => new HtmlWebpackPlugin(item));

  if (options.hot) {
    entry = pushClientJS(entry, options.reload);
    plugins.push(
      new webpack.HotModuleReplacementPlugin()
    );
    // moduleConfig.loaders.unshift({
    //   test: /\.js$/,
    //   loader: 'react-hot',
    //   exclude: nodeModuleReg
    // });
  }

  plugins.push(
    new webpack.DefinePlugin({
      '__DEVTOOLS__': true,
      'process.env': {
        NODE_ENV: JSON.stringify(process.env.NODE_ENV),
        CDN_ROOT: JSON.stringify(process.env.CDN_ROOT)
      },
    }),
    new DashboardPlugin()
  );

  // 从配置文件中获取并生成webpack打包配置
  if (packing.commonChunks) {
    const chunkKeys = Object.keys(packing.commonChunks);
    chunkKeys.forEach((key) => {
      entry[key] = packing.commonChunks[key];
    });

    // 扩展阅读 http://webpack.github.io/docs/list-of-plugins.html#commonschunkplugin
    plugins.push(
      new webpack.optimize.CommonsChunkPlugin({ names: chunkKeys })
    );
  }

  return {
    context,
    progress,
    entry,
    output,
    module: moduleConfig,
    postcss,
    resolve,
    plugins,
    devtool
  };
};

export default webpackConfig({
  progress: true,
  hot: true,
  // 检测到module有变化时，强制刷新页面
  reload: false,
  devtool: 'eval-source-map'
});
