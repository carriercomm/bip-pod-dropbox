/**
 *
 * The Bipio Dropbox Pod.  save_file action definition
 * ---------------------------------------------------------------
 *  Any file generated by a Bip can be saved to a folder in your Dropbox account
 *  under the Bipio App folder
 * ---------------------------------------------------------------
 *
 * @author Michael Pearson <github@m.bip.io>
 * Copyright (c) 2010-2013 Michael Pearson https://github.com/mjpearson
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */
var dbox = require('dropbox'),
    fs = require('fs');

function SaveFile(podConfig) {
    this.name = 'save_file';
    this.title = 'Save file to Dropbox';
    this.description = 'Any file generated by a Bip can be saved to a folder in your Dropbox account under the Bipio App folder';
    this.trigger = false;
    this.singleton = false;
    this.podConfig = podConfig;
}

SaveFile.prototype = {};

SaveFile.prototype.getSchema = function() {
    return {
        'config' : {
            properties : {
                "base_dir" : {
                    type : "string",
                    description : "Base Directory" // templated path via imports
                },
                "overwrite" : {
                    type : "boolean",
                    description : "Overwrite Files",
                    "default" : false
                }
            }
        },
        'exports' : {
            properties : {
                'path' : {
                    type : "string",
                    description : "File Path"
                },
                'name' : {
                    type : "string",
                    description : "File Name"
                },
                'size' : {
                    type : "integer",
                    description : "Size in Bytes"
                },
                'human_size' : {
                    type : "string",
                    description : "Friendly Size"
                },
                'mime_type' : {
                    type : "string",
                    description : "File Mime Type"
                }
            }
        },
        "imports": {
            properties : {
                "base_dir" : {
                    type : "string",
                    description : "Base Directory" // templated path via imports
                }
            }
        }
    }
}

/**
 * Invokes (runs) the action.
 */
SaveFile.prototype.invoke = function(imports, channel, sysImports, contentParts, next) {
    var exports = {}, numFiles = contentParts._files.length, dirPfx = '', self = this,
        log = this.$resource.log;

    log('Invoking ', channel);
    config = channel.getConfig();

    if (config.base_dir) {
        dirPfx = config.base_dir;
    }

    if (imports.base_dir) {
        dirPfx += '/' + imports.base_dir
    }

    dirPfx += '/';

    if (contentParts._files && numFiles > 0) {
        var client = new dbox.Client({
            key: this.podConfig.oauth.consumerKey,
            secret: this.podConfig.oauth.consumerSecret,
            sandbox: this.podConfig.oauth.sandbox
        });

        client.setCredentials({
            token : sysImports.auth.oauth.token,
            tokenSecret : sysImports.auth.oauth.secret
        });

        for (var i = 0; i < numFiles; i++) {
            file = contentParts._files[i];
            file.pathed = dirPfx + file.name;

            // search for file in remote, skip if exists
            client.findByName(dirPfx, file.name, function(fileContext, contentParts) {
                var self = client;
                return function(err, stats) {
                    if (err) {
                        log(err, channel, 'error');
                        next(err, {});
                    } else {
                        var numFiles = stats.length, found = false;
                        for (var i = 0; i <  numFiles; i++) {
                            found = fileContext.name == stats[i].name;
                            if (found) {
                                next(err, stats[i], contentParts);
                                break;
                            }
                        }

                        // skip if found
                        if (!found || app.helper.isTrue(channel.config.overwrite)) {
                            fs.stat(fileContext.localpath, function(error, stats) {
                                fs.open(fileContext.localpath, "r", function(error, fd) {
                                    var buffer = new Buffer(stats.size);
                                    fs.read(fd, buffer, 0, buffer.length, null, function(error, bytesRead, buffer) {
                                        if (error) {
                                            log(error, channel, 'error');
                                        }

                                        //var data = buffer.toString("utf8", 0, buffer.length);
                                        fs.close(fd);

                                        log('writing ' + buffer.length + ' bytes ' + fileContext.pathed, channel, sysImports);

                                        self.writeFile(fileContext.pathed, buffer, function(error, stat)  {
                                            if (error) {
                                                log(error, channel, sysImports, 'error');
                                            } else {
                                                log('Wrote ' + stat.path, channel, sysImports);
                                            }

                                            next(error, stat, contentParts);
                                        });
                                    });
                                });
                            });
                        }
                    }
                }
            }(file, contentParts));
        }
    } else {
        // silent passthrough
        next(false, exports, contentParts);
    }
}

// -----------------------------------------------------------------------------
module.exports = SaveFile;