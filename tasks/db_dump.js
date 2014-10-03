/*
 * grunt-mysql-dump-import
 * https://github.com/digitalcuisine/grunt-mysql-dump
 *
 * Forked of:
 * https://github.com/digitalcuisine/grunt-mysql-dump
 *
 * Copyright (c) 2014 Travis McKinney
 * Licensed under the MIT license.
 */

'use strict';

var shell = require('shelljs'),
  path = require('path'),
  fs = require('fs');


/**
 * Lo-Dash Template Helpers
 * http://lodash.com/docs/#template
 * https://github.com/gruntjs/grunt/wiki/grunt.template
 */
var commandTemplates = {
  mysqlcreate: "echo 'CREATE DATABASE IF NOT EXISTS `<%= database %>`;' | mysql -h <%= host %> -P <%= port %> -u<%= user %> <%= pass %>",
  mysqldump: "mysqldump -h <%= host %> -P <%= port %> -u<%= user %> <%= pass %> <%= database %>",
  mysqlimport: "mysql -h <%= host %> -P <%= port %> -u<%= user %> <%= pass %> <%= database %> < <%= dumpfile %>",
  ssh: "ssh <%= host %>"
};


module.exports = function(grunt) {
  /** DB DUMP
   * dump database to specified
   */
  grunt.registerMultiTask('db_dump', 'Dump database', function() {
    // Get tasks options + set default port
    var options = this.options({
      pass: "",
      port: 3306,
      backup_to: grunt.config.process("db/backups/<%= grunt.template.today('yyyy-mm-dd') %>_" + this.target + ".sql")
    });

    var paths = generate_file_paths(options.backup_to);

    grunt.log.subhead("Dumping database '" + options.title + "' to '" + paths.file + "'");
    if (db_dump(options, paths)) {
      grunt.log.success("Database dump succesfully exported");
    } else {
      grunt.log.fail("Database dump failed!");
      return false;
    }
  });

  grunt.registerMultiTask('db_import', 'Import database', function() {
    // Get tasks options + set default port
    var options = this.options({
      pass: "",
      port: 3306,
      import_from: grunt.config.process("db/backups/<%= grunt.template.today('yyyy-mm-dd') %>_" + this.target + ".sql")
    });

    var paths = generate_file_paths(options.import_from);

    grunt.log.subhead("Importing database '" + options.title + "' from '" + paths.file + "'");
    if (db_import(options, paths)) {
      grunt.log.success("Database dump succesfully imported");
    } else {
      grunt.log.fail("Database import failed!");
      return false;
    }
  });


  function generate_file_paths(filePath) {
    var paths = {};
    paths.file = filePath;
    paths.dir = path.dirname(paths.file);
    return paths;
  }

  /**
   * Dumps a MYSQL database to a suitable backup location
   */
  function db_dump(options, paths) {
    var cmd;

    grunt.file.mkdir(paths.dir);


    // 2) Compile MYSQL cmd via Lo-Dash template string
    //
    // "Process" the password flag directly in the data hash to avoid a "-p" that would trigger a password prompt
    // in the shell
    var tpl_mysqldump = grunt.template.process(commandTemplates.mysqldump, {
      data: {
        user: options.user,
        pass: options.pass != "" ? '-p' + options.pass : '',
        database: options.database,
        host: options.host,
        port: options.port
      }
    });


    // 3) Test whether we should connect via SSH first
    if (typeof options.ssh_host === "undefined") {
      // it's a local/direct connection            
      cmd = tpl_mysqldump;

    } else {
      // it's a remote connection
      var tpl_ssh = grunt.template.process(commandTemplates.ssh, {
        data: {
          host: options.ssh_host
        }
      });

      cmd = tpl_ssh + " \\ " + tpl_mysqldump;
    }

    // Capture output...
    var ret = shell.exec(cmd, {
      silent: true
    });

    if (ret.code != 0) {
      grunt.log.error(ret.output);
      return false;
    }

    // Write output to file using native Grunt methods
    grunt.file.write(paths.file, ret.output);

    return true;
  }

  /**
   * Import a MYSQL dumpfile to a database
   */
  function db_import(options, paths) {
    var cmds = [];


    // 2) Compile MYSQL cmd via Lo-Dash template string
    //
    // "Process" the password flag directly in the data hash to avoid a "-p" that would trigger a password prompt
    // in the shell
    var tplData = {
        user: options.user,
        pass: options.pass != "" ? '-p' + options.pass : '',
        database: options.database,
        host: options.host,
        port: options.port,
        dumpfile: options.import_from
      },
      tpl_mysqlcreate = grunt.template.process(commandTemplates.mysqlcreate, { data: tplData }),
      tpl_mysqlimport = grunt.template.process(commandTemplates.mysqlimport, { data: tplData });

    // check if dumpfile exists
    if(!fs.existsSync(options.import_from)){
      grunt.warn('Dump file "' + options.import_from + '" does not exist.');
    }


    // 3) Test whether we should connect via SSH first
    if (typeof options.ssh_host === "undefined") {
      // it's a local/direct connection            
      cmds = [
        tpl_mysqlcreate,
        tpl_mysqlimport
      ];

    } else {
      // it's a remote connection
      var tpl_ssh = grunt.template.process(commandTemplates.ssh, {
        data: {
          host: options.ssh_host
        }
      });

      cmds = [
        tpl_ssh + " \\ " + tpl_mysqlimport
      ];
    }

    var cmdsLen = cmds.length;
    for(var i = 0; i<cmdsLen; i++){

      // Capture output...
      var cmd = cmds[i],
        ret = shell.exec(cmd, {
          silent: true
        });

      if (ret.code !== 0) {
        grunt.log.error(ret.output);
        return false;
      }

    }

    //if we got here, it's all good
    return true;
  }
};